# Published data sources: well-water salinity and farm-soil salinity

Compiled 2026-11-16. Every number in the CSV files in this folder was read directly from the source named next to it. Nothing was estimated, interpolated or extrapolated.

**Location note:** no qualifying data was found for Abu Dhabi emirate (Al Ain, Liwa). All the CSV data comes from the fallback area, **Al-Batinah, Oman**.

## Files

| File | Rows | Content |
|---|---|---|
| `batinah_water_ec.csv` | 69 | Groundwater salinity for 18 Ministry monitoring wells in Al-Batinah, Oman, in 1991, 1993, 2005 and 2010. Converted to dS/m. |
| `batinah_well_T52_water_ec.csv` | 4 | One well only (T-52), taken from the same table. This is a clean single-well series for demos. |
| `batinah_soil_tests.csv` | 2 | Mean farm-soil ECe and pH for 8 Al-Batinah farms, for 1993 and 2020. |

---

## Source 1: groundwater salinity time series (Al-Batinah, Oman)

**Citation:** Al-Rahbi, S.H., Al-Mulla, Y.A., Jayasuriya, H. (2019). *Evaluation of salinity intrusion in arable lands of Al-Batinah coastal belt using unmanned aerial vehicle (UAV) color imagery.* SQU Journal of Agricultural and Marine Sciences 24(1): 44-50. DOI 10.24200/jams.vol24iss1pp44-50.
- Publisher PDF: https://journals.squ.edu.om/index.php/jams/article/download/2809/2779
- Mirror used for reading: https://distantreader.org/stacks/journals/jams/jams-2809.pdf

**What was taken:** Table 2 (p. 46), titled "Location of salinity monitoring wells in Al-Batinah region with the observed salinity (ppm) in 1991, 1993, 2005 and 2010".
- It covers 18 wells: N-101, N-92, T-52, N-79, B-49, T-30, N-107, B-70, B-73, B-83, T-46, N-63, B-31, N-53, N-71, N-111, N-66 and T-85.
- Each well has one value per year, and the values are given in ppm.
- The table gives Easting/Northing for each well. The coordinate system is not stated (it is probably UTM), so the coordinates were not used.
- I checked the PDF text layer against a rendered image of the table, and the values match.

**Original data owner:** the paper's text says the Ministry of Regional Municipalities and Water Resources (Oman) collected the data from 18 wells in these years. The paper cites this data as "Choudri BS, Baawain M, Ahmed M. 2015b. Review of water quality and pollution in coastal areas of Oman. Pollution Research 34(2): 229-239". I did not access Choudri et al. (2015b), so Table 2 of Al-Rahbi et al. (2019) is the source I actually read.

**Unit conversion:** the footnote of Table 2 gives the conversion:
> ppm = dS/m x 640 (EC = 0.1 to 5 dS/m), ppm = dS/m x 800 (EC > 5 dS/m)

I inverted that conversion as follows:
- **ppm ≤ 3200:** EC = ppm / 640. The result is ≤ 5 dS/m, which is consistent with the 640 range.
- **ppm > 4000:** EC = ppm / 800. The result is > 5 dS/m, which is consistent with the 800 range.
- **3200 < ppm ≤ 4000:** neither factor gives a result inside its own range, so the conversion is ambiguous. These 3 values were left out of the CSV:
  - N-71, 2010: 3590 ppm
  - T-85, 1991: 3994 ppm
  - T-85, 1993: 3610 ppm

The CSV values are the exact quotients, for example 1606/640 = 2.509375. They were not rounded. The table only gives ppm, so the precision of the original EC readings is not known. Treat the trailing decimals as conversion artefacts, not as measurement precision. Many of the ppm values are exact multiples of 640 or 800 (for example 3072 = 4.8 × 640 and 12288 = 15.36 × 800). This suggests the ppm values were themselves calculated from EC readings.

**Dates:** the table gives only years. Every row uses the mid-year date `YYYY-07-01T00:00:00+04:00`, following the project convention. The real sampling day and month are not known. The CSV `note` says "year only".

**Does it meet the time-series requirement (≥4 dated values over ≥3 weeks)?** Yes. 16 of the 18 wells have all 4 years (1991, 1993, 2005 and 2010), which covers 19 years. The two exceptions are N-71, with 3 usable values, and T-85, with 2.

**Table 2 values (ppm, as published):**

| Well | 1991 | 1993 | 2005 | 2010 |
|---|---|---|---|---|
| N-101 | 1504 | 1632 | 2112 | 3072 |
| N-92 | 839 | 833 | 835 | 849 |
| T-52 | 1606 | 2214 | 8262 | 12288 |
| N-79 | 800 | 931 | 1280 | 1798 |
| B-49 | 7379 | 8896 | 8979 | 9126 |
| T-30 | 9280 | 9421 | 10682 | 14784 |
| N-107 | 1187 | 1112 | 5114 | 10432 |
| B-70 | 5440 | 6573 | 6144 | 11520 |
| B-73 | 7571 | 7424 | 8800 | 9728 |
| B-83 | 8410 | 6298 | 9600 | 12160 |
| T-46 | 6720 | 7507 | 13120 | 16576 |
| N-63 | 1382 | 1312 | 5133 | 14656 |
| B-31 | 4032 | 4902 | 11494 | 11514 |
| N-53 | 1344 | 672 | 1293 | 1792 |
| N-71 | 1427 | 1267 | 1958 | 3590 |
| N-111 | 774 | 833 | 1760 | 1837 |
| N-66 | 2138 | 1760 | 1978 | 2323 |
| T-85 | 3994 | 3610 | 6278 | 8896 |

**Caveats:**
- These are government **monitoring wells**, not identified farm irrigation wells. Their depths are not given.
- The import format has no well-ID column, so the well ID is written at the start of the `note`. If the app plots `batinah_water_ec.csv` as one series, readings from 18 wells will be mixed together. Use `batinah_well_T52_water_ec.csv` when you need one well's series.
- The data comes from a second-hand table: the authors re-tabulated Ministry data from another paper.

---

## Source 2: farm-soil ECe and pH (Al-Batinah, Oman)

**Citation:** Al-Busaidi, W., Janke, R., Menezes-Blackburn, D., Khan, M.M. (2022). *Impact of long-term agricultural farming on soil and water chemical properties: A case study from Al-Batinah regions (Oman).* Journal of the Saudi Society of Agricultural Sciences 21(6): 397-403. https://doi.org/10.1016/j.jssas.2021.11.002 (open access, CC BY-NC-ND).

**What was taken:** the numbers come from the **abstract only**. I read the abstract through the Semantic Scholar API record for the DOI; the bibliographic details come from the DOAJ and OpenAlex records. The full text on ScienceDirect was behind a CAPTCHA, which I did not attempt to pass, so I could not see the per-farm tables. The abstract states:
- Soil samples were taken from **eight farms** in Al-Batinah, and the study looks at long-term farming from 1993 to 2020.
- Soil ECe rose from **1.5 dS/m (± 0.49)** to **6.6 dS/m (± 1.35)**.
- Soil pH fell from **8.4** to **7.5**.

These are averages across the farms. In the CSV they are recorded as `1993-07-01` and `2020-07-01`, using the mid-year date because only years are given. They are also recorded under `Block 1`, as the template requires; this is not a real block.

**Caveats:**
- These are averages of 8 farms, not one plot.
- The abstract does not give the pH method (water or CaCl2, and the ratio), the sampling depth, or the sampling dates.
- The abstract does not say whether the 1993 values come from historical records or archived samples.
- `ec_1to5`, `moisture_vwc` and `lab` are left empty because the source does not give them.
- Before using these numbers beyond a demo, check the full text (tables and methods).

---

## Sources checked but not used in the CSVs

- **GLOBE student report, Sohar, Oman (2025-26).** The title is "Comparative Analysis of the Impact of Climate Variability on the Chemical Properties of Agricultural Well Water in Sohar (2018-2025)". It was written by Al-Yhyai M.O. and Al-Balushi S.I. (students at Hind bint Al-Muhallab Basic Education School), and is hosted at https://www.globe.gov/documents/10157/0/10754848/734ebb86-d614-2f78-18eb-9fe4ccacae3d.
  - It reports annual average EC for three farm wells, which it says come from the Agricultural Research Center in Sohar.
  - It also reports Oct, Nov and Dec 2025 field readings for Farm 2: 1.28, 1.33 and 1.38 dS/m (Table 8).
  - **Rejected** for these reasons:
    - The table labelled as salinity (EC) contains the pH values; it is a copy error.
    - The annual EC values appear only as chart labels.
    - The cited data website is a placeholder ("www.....com").
    - The three monthly readings give only 3 dates.
    - It is a school project and has not been peer-reviewed.
- **Batarseh et al. (2021).** *Dataset for the physio-chemical parameters of groundwater in the Emirate of Abu Dhabi, UAE.* Data in Brief 38: 107353. https://doi.org/10.1016/j.dib.2021.107353
  - This is an EAD baseline study of 145 wells in the Al Ain and Al Dhafra regions, sampled January to April 2018.
  - Table 1 has lab EC in µS/cm for each well, but no sampling date for each well, so it is a one-off snapshot and not a time series.
  - The PMC page later returned a reCAPTCHA, so I could not read the table values myself. I did not record any of its numbers.
  - It is the best lead for Al Ain well EC if someone can open the article in a normal browser.
- **EAD presentations to FAO.** These are Athamneh, B., *Abu Dhabi's Integrated Approach to Soil Salinity* (GSOWA 2023) and *Soil salinity management plan of the UAE* (INSAS meeting), both on fao.org.
  - They give "Average soil salinity 8-16 dS/m" as a range for the whole emirate.
  - They also include a "Soil Salinization Index", but it has no units and is not ECe.
  - Neither was used. EAD's district-level *Soil Salinity Management Plan* PDF is no longer online, and the only archived copy is truncated.
- **Fragaszy & McDonnell (2016).** *Oasis at a Crossroads: Agriculture and Groundwater in Liwa, UAE.* IWMI, Groundwater governance in the Arab World Report No. 15.
  - It contains only qualitative salinity trends from farmer interviews.
  - It has one contamination case near the Bu Hasa oil field: TDS rose from 500 to 1,000 ppm by 1985 and to 4,500 ppm by 1996 (citing Alsharhan et al. 2001). The starting value has no date, and the site is not a farm.
- **Al Barwani & Helmi (2006).** SQU JAMS 11: 55-69 (Seeb–Suwaiq, 1984–2005). It reports the share of land area in each salinity class, not readings for individual wells.
- **Hadidi et al. (2020).** Desalination and Water Treatment 176 (2020), doi 10.5004/dwt.2020.25502 (Maawil catchment). The salinity time series is shown only in charts.
- **Abu Dhabi SDI open-data salinity layers.** These include GroundwaterSalinityEC, GroundwaterSalinity2016 and GWSalinity2008. They are polygons of salinity classes, not point measurements.
- **UAEU theses on Al Wagan and Al Ain groundwater.** These are Ali Khalifa (2014) and Al Shahi (2002). The site uses a Cloudflare bot challenge, so they were not accessed. They might contain tables of salinity for individual wells over several years.
