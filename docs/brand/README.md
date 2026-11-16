# Milh brand

**The idea:** a water drop with a sprout cut out of it, growing from a salt crystal. "Milh" is Arabic for salt, so the mark reads as salty water, turned into growth. The dot of the "i" in the wordmark is the same gold salt crystal.

**Tagline:** *Every drop, decided.*

| Colour | Hex | Use |
|---|---|---|
| Date-palm green | `#1F5C45` | the drop, the wordmark, the app icon background |
| Desert sand | `#EAD9B5` | backgrounds, the drop on green |
| Sun gold | `#F6B73C` | the salt crystal only |
| Water blue | `#2E86C1` | water in the product, never in the logo |

**Files**
- `web/public/milh-logo.svg`: the full logo (drop and "milh")
- `web/public/favicon.svg`: the drop alone, for the browser tab
- `web/public/milh.svg`: the app icon (sand drop on a green rounded square)
- `web/src/brand/Logo.tsx`: `MilhLogo` and `MilhMark` for the app; keep them in step with the SVG files
- `milh-brand-board.webp`, `milh-logo-concept.webp`: the generated concept images the SVGs were redrawn from (for slides)

## Sign-in art

The tablet sign-in shows `web/public/login-art.webp` on the left and the owner sign-in shows `web/public/login-art-owner.webp` (falling back to the shared picture until it exists) (portrait, about 2:3, at least 1400 × 2100). Until that file exists, the animated farm sky is shown instead. Keep the lower 40% of the picture dark and calm: the headline sits there. The prompts used to make it are in the project chat; the brief is "flowing desert-dune ribbons turning into water, in sand, gold, palm green and water blue, on deep green-black".

## Farm screens ("earth" look)

The worker tablet and the owner screens use dark glass cards over the farm (inspired by the "Earthly" smart-farming dashboard concept on Dribbble). Pictures in `web/public/scenes/`, made with Higgsfield (GPT Image 2.6, 2 credits) and compressed for the web:
- `farm-aerial.webp`: an aerial picture of a date farm like the example farm, used behind the block card. It is a picture, not a map: it is labelled "Picture of a farm like yours" and no block is placed on it.
- `farm-hero.webp`: sunrise over a date palm, behind the tablet's start screen.
- `farm-bg.webp`: the aerial picture, shrunk and pre-blurred, behind every farm screen (a few KB, so tablets do not blur live).
