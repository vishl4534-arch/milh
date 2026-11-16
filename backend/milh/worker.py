"""Background worker: `python -m milh.worker`. Runs the scheduled jobs against the database."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

import httpx
from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.schedulers.blocking import BlockingScheduler

from milh import jobs
from milh.announcements.tts import get_tts
from milh.config import get_settings
from milh.db import session_factory, utcnow

log = logging.getLogger("milh.worker")


def _run(name: str, fn: Callable[..., Any], *args: Any) -> Callable[[], None]:
    def wrapped() -> None:
        with session_factory()() as session:
            try:
                n = fn(session, *args) if args else fn(session, utcnow())
                if n:
                    log.info("%s: %s", name, n)
            except Exception:
                log.exception("%s failed", name)
                session.rollback()

    return wrapped


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = get_settings()
    http = httpx.Client(headers={"User-Agent": "milh-farm-platform/0.1"})
    tts = get_tts()
    if tts is None:
        log.warning("ElevenLabs not configured: announcements will show text with a chime only")
    # Plan/alert/audio jobs run one at a time ("default"): they write the same rows. Slow network fetches
    # get their own lane ("io") so an unreachable API cannot hold up the farm's plan.
    sched = BlockingScheduler(timezone="UTC",
                              executors={"default": ThreadPoolExecutor(1), "io": ThreadPoolExecutor(2)},
                              job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 120})
    sched.add_job(_run("weather", jobs.refresh_all_weather, http), "interval", minutes=60, next_run_time=utcnow(),
                  executor="io")
    sched.add_job(_run("soil_profile", jobs.refresh_all_soil, http), "interval", hours=24, next_run_time=utcnow(),
                  executor="io")
    sched.add_job(_run("daily_plan", jobs.run_daily_plans), "interval", minutes=1, next_run_time=utcnow())
    sched.add_job(_run("replan", jobs.replan_dirty), "interval", minutes=2, next_run_time=utcnow())
    sched.add_job(lambda: _run("audio", jobs.audio, tts, settings.media_dir, utcnow())(), "interval", minutes=2)
    sched.add_job(_run("staleness", jobs.staleness), "interval", minutes=15)
    log.info("worker started")
    sched.start()


if __name__ == "__main__":
    main()
