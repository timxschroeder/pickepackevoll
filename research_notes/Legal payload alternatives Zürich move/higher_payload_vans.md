# Higher-payload rental vans (≤3.5 t, class B) for Hamburg → Zürich

Context: booked = 3.5 t box van with tail lift, 4370 × 2100 × 2250 mm (~20.6 m³), payload 815 kg. Load ~850–930 kg, ~10.7 m³ item volume, tallest item ~140–145 cm upright. Research date 2026-10-14. Several rental pages (sixt.de) returned HTTP 403 to the fetch tool; figures marked "(search snippet)" were not read on the page itself.

## 1. Payload of typical 3.5 t rental vans, and which fit the load

### Takeaway
A 3.5 t **panel van** (Sprinter/Crafter/TGE/Daily long high-roof) usually has about 950–1,200 kg payload. A 3.5 t **box van with tail lift** is usually 815–920 kg, because the box and lift add weight. A long high-roof panel van (~13–14 m³, ~1.8–1.9 m inside height) holds 10.7 m³ of items only with tight packing. It does give 200–400 kg more payload than the booked box van.

### Cited Findings
- Sixt DE fleet list (search snippet; page 403 to fetcher):
  - "Kleiner Lkw unter 3,5 t", IVECO Daily 3.5t KURZ: payload **1,150 kg**, load space 3375 × 1740 × 1900 mm (≈11.2 m³).
  - "Mittlerer Lkw unter 3,5 t", MAN TGE 3.5t LANG (the VW Crafter twin): payload **950 kg**, 4217 × 1740 × 1798 mm (≈13.2 m³).
  - "Mittlerer Lkw mit Hebebühne", IVECO Daily 3.5t KOFFER: payload **920 kg**, 4180 × 2030 × 2080 mm.
  — [Sixt Transporter-Einwegmiete](https://www.sixt.de/lkw/transporter-einwegmiete) / [Sixt Transporter mit Automatik](https://www.sixt.de/flotte/lkw/transporter-mit-automatik-mieten/)
- Hertz Vans Switzerland fleet:
  - C4 "Allrounder" panel van: **1,100 kg** payload, load space 350 × 180 × 180 (≈11.3 m³).
  - H4 "Nutzfahrzeug mit Hebebühne": **815 kg** ("max. zulässige Belastung"), 430 × 205 × 220. This is essentially the same class as the booked van, so **815 kg is the standard figure for a 3.5 t box van with tail lift**, not a bad unit.
  — [hertzvans.ch/de/flotte](https://hertzvans.ch/de/flotte/)
- ADAC rental portal, inside sizes of the smallest model per class:
  - Europcar VW Crafter: 3450 × 1830 × 1860 mm, 10.4 m³.
  - Avis Mercedes Sprinter lang: 4070 × 1870 × 1930 mm, 13 m³.
  - Hertz Sprinter Koffer: 4230 × 1990 × 2000 mm, 16.84 m³.
  - No payloads listed. Reservations are per class, not per model.
  — [ADAC Autovermietung Transporter-Flotte](https://autovermietung.adac.de/transporter/flotte/)
- Dealer listings (unverified, one vehicle each):
  - Sprinter 317 CDI extra-long high roof: 2,285 kg kerb, **1,215 kg** max load, wheelbase 4,325 mm.
  - Sprinter 315 CDI long high roof: **1,196 kg** payload.
  - Crafter 35 L3H3: 2,386 kg kerb, **1,114 kg** payload, 12 m³.
  — [truckscout24 listing](https://www.truckscout24.de/tsp/ts-227-50-392); [truckscout24 Crafter listings](https://www.truckscout24.de/lkw/gebraucht/alle/vw/crafter)
- Europcar's new Renault Master E-Tech electric van is advertised with "über 1.000 kg Nutzlast". — [firmenauto.de](https://www.firmenauto.de/fahrzeuge/transporter/europcar-elektrische-transporter-mieten-bundesweit-lieferverkehr/)
- Tail-lift weights:
  - Dautel Fleetlifter DFL 750 (for 3.5–5.5 t): **180 kg** own weight. — [eurotransport.de](https://www.eurotransport.de/fahrzeuge/lkw/dautel-neue-ladebordwand-fuer-3-5-bis-5-5-tonner/)
  - Larger Palfinger MBB C 1500 L: 390–415 kg (truck class, not 3.5 t). — [Palfinger](https://palfinger.com/de-de/produkte/mbb-c-1500-l_p_3699)
- Counter-example: one listed 3.5 t box van with tail lift (Veldhuizen body) shows 2,320 kg kerb and 1,180 kg payload. So light box vans do exist, but they are not typical rental units. — [mietwagen-talk lexicon / truckscout listing via search](https://www.mietwagen-talk.de/lexicon/entry/658-tmba/)

### Inferences
- **Panel van (long high-roof)**
  - Payload: ~950–1,200 kg, so +135 to +385 kg over the 815 kg booked.
  - Inside height: ~1.80–1.93 m, so the 140–145 cm upright items fit.
  - Inside width: ~1.74–1.87 m, enough for the 165 × 140 glass top on edge.
  - Length: ~4.07–4.3 m, so the 200 cm boxspring bases fit lengthways.
  - Volume: 13–14 m³ gross vs 10.7 m³ items. Packing efficiency must be ~75–80%. Feasible but tight, with wheel arches and sliding-door gaps. **Verify with the packer** using the container dims, e.g. 4217 × 1740 × 1798 for Sixt "Mittlerer Lkw" (TGE), or 4070 × 1870 × 1930 for the Avis Sprinter lang.
- **Short Iveco Daily 1,150 kg (≈11.2 m³)**: too small for 10.7 m³ items plus 200 cm beds at 3375 mm length. Not recommended.
- **Box vans without tail lift (≈16–17 m³)**: likely ~1,000–1,100 kg payload (815–920 + ~180 kg lift). I found no rental listing that guarantees this.
- **Payload for the target ~930 kg cargo**: an MAN TGE "950 kg" unit gives almost no margin once Michelle is counted (see section 2). A Sprinter/Crafter rated ≥1,100 kg solves it with margin.
- Rentals guarantee the class, not the model. **Ask the station for the specific vehicle's Zulassungsbescheinigung field G (Leergewicht) / F.2.**

### Gaps
- No manufacturer data sheet was retrieved for the Crafter L4H3/L5H3, Transit L4H3, Ducato Maxi L5H3 or Master L3H3 payloads. Values above are from rental fleet lists and single dealer listings.
- Europcar/Avis/Starcar/Buchbinder Hamburg payload per category were not found on accessible pages.

## 2. How payload is defined, and does Michelle count?

### Takeaway
"Masse in fahrbereitem Zustand" (EU 1230/2012) already includes a 75 kg driver and a tank ≥90% full. Passengers are **not** included and must come out of the stated payload. The legal limit is the actual weighed total mass ≤3,500 kg (plus axle limits). In practice, usable cargo payload ≈ stated Nutzlast − (driver's real weight − 75) − passenger weight − any extras (e.g., 30 kg of extras, food).

### Cited Findings
- EU Reg. 1230/2012, Art. 2(4a): mass in running order = the vehicle with fuel tank(s) "zu mindestens 90 % … gefüllt" "zuzüglich der Masse des Fahrers", standard equipment per manufacturer. — [gesetze.legal, VO (EU) 1230/2012 Art. 2](https://gesetze.legal/eu/vo_eu_2012_1230/2)
- Art. 2(19): passenger mass is a nominal mass × number of seats, "jedoch ohne die Masse des Fahrers". Art. 2(7): technically permissible maximum laden mass = the manufacturer's maximum laden mass. — [gesetze.legal](https://gesetze.legal/eu/vo_eu_2012_1230/2)
- Manufacturer explanation (motorhome industry, same regulation):
  - Running-order mass includes a "Pauschalgewicht für den Fahrer in Höhe von 75 kg" and a 90% tank.
  - Payload = 3,500 − running-order mass − 75 kg per passenger seat − optional equipment.
  - Running-order mass is subject to ±5% production tolerance.
  — [Carthago weight notes (PDF)](https://www.carthago.com/fileadmin/user_upload/lModelljahr2023/PDFs_2023/Rechtliche_Hinweise_07_23/CA_Katalogbeileger-Gewicht_Einzelseiten_DE_V3.1.pdf); [Knaus notes (PDF)](https://www.knaus.com/fileadmin/media/global/hinweise/wohnmobile/vollintegriert/kta-knaus-hinweise-rmi-de-at.pdf)

### Inferences
- Commercial-van rental "Nutzlast" is usually F.2 (zGM) minus the registration's Leergewicht (field G = mass in running order incl. 75 kg driver). So **every passenger counts against payload**, and the driver counts only above 75 kg.
- Worked example, booked van:
  - 815 − Michelle (~60–65 kg, assumed) − driver excess (Tim's weight − 75, assumed ~5–10 kg) − small cab luggage ≈ **~730–750 kg real cargo capacity**, well below 850–930 kg.
  - Exact figure depends on their real body weights (not researched).
- With a ~1,150–1,200 kg Sprinter/Crafter, real cargo capacity is ≈1,050–1,100 kg. That covers 930 kg with ~100+ kg margin.
- With a 950 kg TGE "Mittlerer Lkw", real capacity ≈ 860–880 kg. That is borderline for 930 kg.
- The ±5% tolerance on running-order mass (~±120 kg on a 2.4 t van) means only a weighbridge result is conclusive.

### Gaps
- I did not find a German rental company's own definition of "Nutzlast" stated on its terms page.
- I could not retrieve the full EUR-Lex text. Article quotes are via gesetze.legal (a mirror).

## 3. Rental companies in Hamburg offering one-way to Zürich/CH, fees and prices

### Takeaway
International one-way van rentals Germany → Switzerland are possible only on request with some majors, and are expensive (several hundred € to ≥CHF 900). Several sources say van returns abroad are generally not possible. The cheap pattern is a domestic one-way to a German border town (Konstanz, Singen, Lörrach/Weil am Rhein, Waldshut) plus train. Another option is a round trip that keeps the van for the return.

### Cited Findings
- Hertz Vans CH: one-way within Switzerland "ab CHF 150.-", "international ab CHF 900.-". — [hertzvans.ch](https://hertzvans.ch/)
- Mietwagen-Radar 2026 comparison:
  - Switzerland one-way fees are **250+ €** for cars, because a car returned in CH cannot be re-rented (non-EU, tax). Even Singen → Zürich can exceed 250 €.
  - Sixt allows one-way to 24 countries, with fees "schnell mehrere hundert Euro".
  - Hertz international returns need local station confirmation.
  - Van one-way fees are "often clearly higher" than for cars.
  - Domestic one-way fees: Europcar 45 € flat in Germany; Hertz from 39 €; Enterprise from 26.99 €; Sixt ~34–45 € + 19.99 €.
  - Suggested workaround: return in a German border city and continue by train.
  — [mietwagen-radar.de](https://www.mietwagen-radar.de/einwegmiete-mietwagen/)
- billiger-mietwagen.de (broker): "generell nicht möglich, den Transporter in einem anderen Land zurückzugeben". — [billiger-mietwagen.de Transporter Schweiz](https://www.billiger-mietwagen.de/transporter-mieten-schweiz.html); [FAQ Transporter-Einwegmiete](https://www.billiger-mietwagen.de/faq/transporter-einwegmieten.html)
- Forum reports (older, unverified):
  - Europcar DE→CH one-way is possible.
  - The cheapest option is rent and return in Germany with a border crossing.
  - Vans often get checked at the CH border.
  - Another user paid >400 € extra for a Sixt CH↔DE one-way.
  — [mietwagen-talk forum 4280](https://www.mietwagen-talk.de/forum/thread/4280-umzug-schweiz-nach-deutschland-einwegmiete/); [mietwagen-talk 21638](https://www.mietwagen-talk.de/forum/thread/21638-sixt-schweizer-mietwagen-nach-deutschland-f-hren/)
- An older Hertz-terms forum quote lists Switzerland among countries where cars may be driven and/or returned. Cross-border fee **29.75 € per crossing**, up to 600 € if not declared. Not van-specific and possibly outdated. — [mietwagen-talk Hertz Ungarn thread](https://www.mietwagen-talk.de/forum/thread/21399-hertz-ungarn-hat-jetzt-auch-eine-geb-hr-f-r-fahrten-ins-ausland/)
- Avis CH: international one-way enquiries via 0848 81 18 18. Utility-vehicle conditions are set by the commercial-vehicle station. — [avis.ch Einwegmiete](https://www.avis.ch/rund-um-avis/serviceleistungen/einwegmiete)
- Europcar Hamburg: vans from 2 m³ to trucks of 20 m³; pickup at city, airport, Hbf. — [europcar Hamburg van rental](https://www.europcar.co.nz/en-nz/places/van-rental-germany/hamburg)
- Starcar (Hamburg-Altona, Bergedorf) rents vans/trucks with 1–12 t payload, some with lift; no one-way CH info found. — [bau.de Transporter](https://bau.de/presse/thema-transporter); [mietwagen-talk Starcar](https://www.mietwagen-talk.de/forum/thread/16-starcar-autovermietung/)

### Inferences
- Swapping the booked box van for a panel van at the **same company/station** is likely the least-effort change, if that company already accepts the trip to Zürich.
- Expect the long panel van's rate to be similar or slightly lower than the box van's (Hertz CH list: C4 CHF 89 vs H4 CHF 109 "ab"/day). One-way/international surcharges are the dominant cost.

### Gaps
- No concrete 2–3-day Hamburg→Zürich panel-van quote was found. That needs the booking engines (Sixt/Europcar/Hertz), which were not accessible to the fetch tool.
- No info found on Buchbinder, Toom/OBI/Hornbach DIY rentals regarding one-way to CH. DIY rentals are typically return-to-same-store (unverified).

## 4. Weighing the loaded van in Hamburg

### Takeaway
Two practical options:
- **HME Billbrook**: calibrated 60 t weighbridge, open to private persons Mon–Sat, printed Wiegeschein. Price not published; an old forum post says ~10 €.
- **ADAC Prüfzentrum Hamburg**: vehicles ≤3.5 t, by appointment, €29 members / €39 non-members, cashless.

### Cited Findings
- HME Hamburger Müllentsorgung, Andreas-Meyer-Straße 39, 22113 Hamburg, tel. 040-73 43 36-0.
  - Calibrated ("geeicht") weighbridge for "Gewerbe und Privatpersonen", incl. smaller vehicles.
  - Printed Wiegeschein.
  - Mon–Fri 06:00–17:30, Sat 08:00–14:00.
  - No price on the page.
  — [hme-hamburg.de Verwiegungen](https://hme-hamburg.de/was-wir-machen/verwiegungen)
- Old forum mention of ~10 € for a motorhome at that address (outdated). — [meinwomo.net](https://meinwomo.net/fragen-antworten/F313935.htm)
- ADAC Hansa Prüfzentrum Hamburg: weighing by appointment only (tel. 040 23 91 91 70), ~30 min, €29 members / €39 non-members. Cashless since 1 Sept 2025. Limits: ≤3.5 t, width ≤2.55 m incl. mirrors, height ≤3.40 m. — [ADAC Hansa Wiegen](https://www.adac.de/der-adac/regionalclubs/hansa/mobilitaet-sicherheit/wiegen-wohnmobilen/)
  - The booked box van is ~3.45 m tall (Hertz CH H4 exterior: 345 cm), so it would be right at or over the ADAC height limit. A panel van (~2.6–2.8 m) fits.
- Otto Dörner Recycling, Hovestraße 61 (Veddel), public scale up to 60 t (forum info 2008–2012, unverified). — [segeln-forum](https://www.segeln-forum.de/thread/11462-%C3%B6ffentliche-waagen-in-hamburg/)

### Inferences
- **Weigh with both people aboard and a full tank**: total ≤3,500 kg is the legal test. Ideally also check axle loads (ADAC page does not say whether it measures axles separately).

### Gaps
- Current HME price not published; call ahead.
- Not confirmed whether ADAC measures individual axle loads.
