# Farm map: competitive analysis for ASEAN

Written 2026-10-24 from seven web searches and the farm map's own code. I did not use or test any competitor product. Where a feature is "not found", it means the sources I read did not mention it, not that the product lacks it. Several sources date from 2011 to 2020; check each vendor's current page before quoting any of this.

## Who the farm map competes with

| Product | Who runs it | Where | What it does | Cost to farmer |
|---|---|---|---|---|
| Rice Crop Manager | IRRI, PhilRice | Philippines, Indonesia, Vietnam, Bangladesh, India | Questions about a field give fertiliser, pest, weed or water advice, as a one-page printout or SMS; an offline Android app exists since 2020 | Free |
| AgriDOC | PhilRice | Philippines | Android app to log daily operations and expenses, geotag farms on satellite maps, and follow stage-by-stage guidance | Free |
| RT Analytics | commercial, Vietnam | Vietnam | Farm e-diary, cost, hired labour, inventory, CRM and messaging | Free to farmers; agribusiness pays for the data |
| CropPal | Agri8, Singapore | pilot in Vietnam and Thailand | Gamified recording and review | not found |
| Cropin SmartFarm | Cropin | listed in Cambodia, Indonesia, Malaysia, Philippines, Thailand, Vietnam | Satellite monitoring, weather, pest and crop health; enterprise | not found |
| AGRIVI | AGRIVI | not found for ASEAN | Field records, satellite imagery, weather, pest and disease alerts, roles for cooperatives | One aggregator lists from 1,990 EUR a month; another lists nothing, so unverified |
| RIICE | GIZ, IRRI, sarmap, Allianz Re | Cambodia, Thailand, Vietnam, India, and Indonesia or the Philippines depending on the source | Sentinel radar gives planting date, area, growth and expected yield for insurers and governments; run by PhilRice since 2018 | Institutional |
| AWD tools | Tra Vinh University app with sensors; MimosaTEK pilot; CarbonFarm; JAXA CH4Rice | Vietnam, some Philippines pipeline | Sensor or satellite water level for alternate wetting and drying, aimed at methane credits | Pilots |
| TaniHub, Eragano, Crowde | Indonesian startups | Indonesia | Market access and farm loans, not field management | not found |

## Feature comparison

"Farm map" is from this repository's code and tests. Other columns hold only what the sources state.

| Feature | Farm map | Rice Crop Manager | AgriDOC | RT Analytics | Cropin | AGRIVI | RIICE |
|---|---|---|---|---|---|---|---|
| Field records and diary | yes | not found | yes | yes | not found | yes | no |
| Fields on a satellite map | yes | not found | yes | not found | yes | satellite imagery | yes (radar) |
| Weather-based advice | yes | not found | not found | not found | yes | yes | no |
| Fertiliser advice | nitrogen loss and demand in the season model | yes, its core | stage guidance | not found | not found | not found | no |
| Season simulation on past weather, three crop models | yes | no | not found | not found | not found | not found | no |
| Measured harvest scored against each model | yes | not found | not found | not found | not found | not found | not found |
| Evidence pack with change history | yes | not found | not found | not found | not found | not found | not found |
| Several farms and a roll-up for an investor | yes | not found | not found | not found | enterprise | cooperatives | not found |
| Flood risk | yes | not found | not found | not found | not found | not found | not found |
| Works offline | banner only; forms are not queued | yes | not found | not found | not found | not found | no |
| SMS or print delivery | no | yes | not found | not found | not found | not found | no |
| Languages | 7 (English, Burmese, Vietnamese, Thai, Filipino, Indonesian, Khmer) | English and Vietnamese for the Vietnam tool; Indonesian version exists | not found | not found | not found | not found | no |

## What the sources say about adoption

- Rice Crop Manager: a Philippine monitoring round found 27 % of farmers took up the advice. IRRI reports an average gain of 0.4 t/ha per crop in the Philippines and 0.5 t/ha in India.
- CropPal: Agri8's research found farmers in Vietnam and Thailand wanted easy, gamified recording and review, and that remote advisories were not widely adopted.
- RT Analytics: free for farmers, paid for by agribusiness that benefits from the data.
- A 2026 industry list mentions governance controversies at TaniHub and eFishery. Keep finance claims out of the farm map until there is a reason to add them.

## Table stakes and differentiators

Table stakes, seen in at least two sources: field records, fields on a satellite map, weather-based guidance, local language.

Where the farm map differs, based on what I could not find elsewhere:
1. **An investor's view of several farms** with records, certificates and an evidence pack. The sourced tools are farmer advice, farmer diaries, enterprise suites or institutional satellite services.
2. **Models scored on the farm's own harvests**, with a named baseline and a rule that fewer than 3 seasons is not a score. Competitors report average gains or uptake, not per-field model error.
3. **Burmese and Khmer** among seven languages. RIICE sources do not mention Myanmar, and the Rice Crop Manager country list does not include Myanmar, Cambodia or Thailand.
4. **A change history** where records are voided or corrected, never erased.

## Where the farm map is behind

- No SMS or printed advice, which is how Rice Crop Manager reaches farmers without smartphones.
- Forms do not work offline.
- No free tier story: Rice Crop Manager and AgriDOC are free, so a farmer-pays price will meet free alternatives. The RT Analytics model (farmers free, companies pay) points to investors and agribusiness as the payer.
- Cropin is already listed in six ASEAN countries and RIICE covers area and yield by radar at national scale. The farm map's Sentinel-1 check is still in shadow mode.
- No user research. I found no reviews or forum feedback on any competitor.

## Lessons

- **Adopt:** very easy recording (CropPal), free for the person who enters the data (RT Analytics, Rice Crop Manager), local-language output.
- **Avoid:** selling a yield forecast the models cannot yet back; the first scored test harvest had the own engine 47.5 % low. Avoid mixing in loans or marketplace claims.
- **Test next:** can an investor with 2 or 3 farms enter them and see a roll-up in under ten minutes, and will they pay for the evidence pack and the scored history? That is a question for real investors, not for more desk research.

## Sources

- IRRI Rice Today: Rice Crop Manager, https://ricetoday.irri.org/from-science-to-scale-how-rice-crop-manager-is-revolutionizing-farming-for-millions/
- IRRI news, offline Android release, https://news.irri.org/2020/03/rice-crop-manager-now-available-as.html
- PhilRice, software to aid farmers, https://www.philrice.gov.ph/software-aid-farmers-promoted/
- FAO AGRIS record, AgriDOC app, https://agris.fao.org/search/en/records/64746aea425ec3c088f05723
- GrowAsia, RT Analytics, https://digital.growasia.org/solutions/rt-analytics
- Sustainable Rice Platform, Agri8 smart farming presentation, https://sustainablerice.org/wp-content/uploads/2023/11/Smart-Farming_David-Chen_Agri8.pdf
- ICRISAT, digital tools for precision rice cultivation, https://issca.icrisat.org/scalable-solutions/digital-tools-for-precision-rice-cultivation
- GrowAsia directory, Cropin, https://directory.growasia.org/cropin
- AWS partner story, Nafoods and Cropin, https://aws.amazon.com/partners/success/nafoods-group-cropin/
- Capterra and FitGap listings for AGRIVI, https://www.capterra.in/software/136084/agrivi
- GIZ, RIICE, https://giz.de/en/worldwide/52991.html
- ACRS 2019 paper on RIICE, https://acrs-aars.org/proceeding/ACRS2019/TuP-88.pdf
- IRRI Rice Today, Vietnamese farmers use an AWD app, https://ricetoday.irri.org/vietnamese-rice-farmers-use-mobile-app-for-alternate-wetting-and-drying-technology/
- World Bank blog, precision agriculture in Vietnam, https://blogs.worldbank.org/en/eastasiapacific/precision-agriculture-smallholder-farmers-vietnam-how-internet-things-helps
- GrowAsia, CarbonFarm, https://digital.growasia.org/solutions/carbonfarm-technology
- JAXA, CH4Rice, https://www.eorc.jaxa.jp/SAFE/project/ch4rice
- KrASIA, Tani Group, https://kr-asia.com/tani-group-is-disrupting-agriculture-one-of-indonesias-key-economic-sectors-startup-stories
