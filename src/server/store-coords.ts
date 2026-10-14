/**
 * Approximate store locations (OpenStreetMap), keyed by IKEA store id.
 * Netherlands, Belgium and Germany.
 */
export const STORE_COORDS: Record<string, { lat: number; lon: number }> = {
  "415": { lat: 52.1853, lon: 5.4174 }, // Amersfoort
  "088": { lat: 52.3021, lon: 4.9497 }, // Amsterdam
  "274": { lat: 51.8494, lon: 4.5125 }, // Barendrecht
  "403": { lat: 51.5803, lon: 4.7291 }, // Breda
  "151": { lat: 52.0129, lon: 4.3797 }, // Delft
  "272": { lat: 51.9662, lon: 5.9968 }, // Duiven
  "087": { lat: 51.4993, lon: 5.4726 }, // Eindhoven
  "404": { lat: 53.2175, lon: 6.5873 }, // Groningen
  "378": { lat: 52.3848, lon: 4.6717 }, // Haarlem
  "089": { lat: 50.8993, lon: 5.9451 }, // Heerlen
  "312": { lat: 52.2887, lon: 6.7678 }, // Hengelo
  "270": { lat: 52.0623, lon: 5.0992 }, // Utrecht
  "391": { lat: 52.5322, lon: 6.1626 }, // Zwolle
  "482": { lat: 50.8108, lon: 4.2914 }, // Anderlecht (BE)
  "483": { lat: 49.6375, lon: 5.8911 }, // Arlon (BE)
  "169": { lat: 51.0233, lon: 3.6881 }, // Gent (BE)
  "452": { lat: 50.9193, lon: 5.3141 }, // Hasselt (BE)
  "375": { lat: 50.6789, lon: 5.4629 }, // Liege (BE)
  "423": { lat: 50.4564, lon: 3.9299 }, // Mons (BE)
  "179": { lat: 51.1575, lon: 4.3877 }, // Wilrijk (BE)
  "376": { lat: 50.8717, lon: 4.4919 }, // Zaventem (BE)
  "066": { lat: 48.4049, lon: 10.8713 }, // Augsburg (DE)
  "324": { lat: 52.5338, lon: 13.5146 }, // Berlin-Lichtenberg (DE)
  "394": { lat: 52.5283, lon: 13.2145 }, // Berlin-Spandau (DE)
  "421": { lat: 52.4697, lon: 13.3663 }, // Berlin-Tempelhof (DE)
  "129": { lat: 52.3669, lon: 13.5556 }, // Berlin-Waltersdorf (DE)
  "119": { lat: 51.982, lon: 8.4922 }, // Bielefeld (DE)
  "117": { lat: 52.3089, lon: 10.5045 }, // Braunschweig (DE)
  "412": { lat: 53.489, lon: 8.6056 }, // Bremerhaven (DE)
  "228": { lat: 53.0265, lon: 8.8036 }, // Brinkum (DE)
  "118": { lat: 50.8023, lon: 12.8597 }, // Chemnitz (DE)
  "223": { lat: 51.4911, lon: 7.3696 }, // Dortmund (DE)
  "221": { lat: 51.0867, lon: 13.6951 }, // Dresden (DE)
  "425": { lat: 51.4822, lon: 6.7639 }, // Duisburg (DE)
  "321": { lat: 51.1878, lon: 6.8495 }, // Düsseldorf (DE)
  "396": { lat: 50.9594, lon: 10.9489 }, // Erfurt (DE)
  "148": { lat: 51.4601, lon: 7.001 }, // Essen (DE)
  "393": { lat: 50.1958, lon: 8.6569 }, // Frankfurt (DE)
  "320": { lat: 48.0283, lon: 7.8326 }, // Freiburg (DE)
  "139": { lat: 51.3487, lon: 12.183 }, // Halle/Leipzig (DE)
  "245": { lat: 53.5513, lon: 9.9417 }, // Hamburg-Altona (DE)
  "325": { lat: 53.5108, lon: 10.093 }, // Hamburg-Moorfleet (DE)
  "146": { lat: 53.6489, lon: 9.9281 }, // Hamburg-Schnelsen (DE)
  "222": { lat: 50.1499, lon: 8.9429 }, // Hanau (DE)
  "187": { lat: 52.3138, lon: 9.8167 }, // Hannover EXPO-Park (DE)
  "226": { lat: 52.4924, lon: 9.8378 }, // Hannover-Großburgwedel (DE)
  "494": { lat: 51.2109, lon: 6.6413 }, // Kaarst (DE)
  "430": { lat: 49.4403, lon: 7.7012 }, // Kaiserslautern (DE)
  "323": { lat: 51.5695, lon: 7.6691 }, // Kamen (DE)
  "551": { lat: 49.0054, lon: 8.4413 }, // Karlsruhe (DE)
  "174": { lat: 51.2779, lon: 9.5257 }, // Kassel (DE)
  "333": { lat: 54.3141, lon: 10.1073 }, // Kiel (DE)
  "332": { lat: 50.3822, lon: 7.5681 }, // Koblenz (DE)
  "102": { lat: 50.9848, lon: 6.8969 }, // Köln-Am Butzweilerhof (DE)
  "147": { lat: 50.8617, lon: 6.971 }, // Köln-Godorf (DE)
  "289": { lat: 53.9122, lon: 10.7361 }, // Lübeck (DE)
  "225": { lat: 48.9182, lon: 9.1539 }, // Ludwigsburg (DE)
  "520": { lat: 52.169, lon: 11.6116 }, // Magdeburg (DE)
  "397": { lat: 49.5559, lon: 8.4439 }, // Mannheim (DE)
  "343": { lat: 48.0404, lon: 11.6577 }, // München-Brunnthal (DE)
  "063": { lat: 48.3043, lon: 11.6336 }, // München-Eching (DE)
  "326": { lat: 49.4854, lon: 11.01 }, // Nürnberg-Fürth (DE)
  "069": { lat: 53.1399, lon: 8.2549 }, // Oldenburg (DE)
  "184": { lat: 52.2632, lon: 7.9713 }, // Osnabrück (DE)
  "229": { lat: 49.0017, lon: 12.1779 }, // Regensburg (DE)
  "092": { lat: 54.1088, lon: 12.0518 }, // Rostock (DE)
  "227": { lat: 49.2945, lon: 6.7592 }, // Saarlouis (DE)
  "369": { lat: 50.8628, lon: 8.0024 }, // Siegen (DE)
  "224": { lat: 48.7018, lon: 9.0056 }, // Sindelfingen (DE)
  "328": { lat: 48.4041, lon: 9.977 }, // Ulm (DE)
  "322": { lat: 50.058, lon: 8.3714 }, // Wallau (DE)
  "075": { lat: 49.3062, lon: 8.6291 }, // Walldorf (DE)
  "493": { lat: 50.5689, lon: 8.4972 }, // Wetzlar (DE)
  "492": { lat: 51.3101, lon: 7.2554 }, // Wuppertal (DE)
  "124": { lat: 49.8223, lon: 9.9836 }, // Würzburg (DE)
};
