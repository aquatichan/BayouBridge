// The three synthetic demo households, as the sample picker shows them. No document
// text here: this file ships to the browser. The documents are in ./demos.ts.
// Every name, address, number and company is fictional.

export type DemoId = "reyes" | "johnson" | "nguyen";

export interface DemoCard {
  id: DemoId;
  name: string;
  address: string;
  /** One line each: who lives there, the home, money, and what happened. */
  people: { en: string; es: string };
  home: { en: string; es: string };
  money: { en: string; es: string };
  damage: { en: string; es: string };
}

export const DEMO_CARDS: DemoCard[] = [
  {
    id: "reyes",
    name: "Reyes household",
    address: "1847 Cypress Bayou Ln, Houston, TX 77093",
    people: { en: "Ana (44), her mother Carmen (71) and her son Luis (16)", es: "Ana (44), su mamá Carmen (71) y su hijo Luis (16)" },
    home: { en: "Owns a brick house in Aldine. Homeowners insurance.", es: "Dueña de una casa de ladrillo en Aldine. Seguro de vivienda." },
    money: { en: "About $3,800 a month from Ana's job as a school bus driver", es: "Unos $3,800 al mes del trabajo de Ana como chofer de autobús escolar" },
    damage: { en: "Roof torn open, living room flooded, Carmen's oxygen lost power. FEMA said no.", es: "Techo abierto, sala inundada, el oxígeno de Carmen se quedó sin luz. FEMA dijo que no." },
  },
  {
    id: "johnson",
    name: "Johnson household",
    address: "2210 Telephone Rd, Apt 4B, Houston, TX 77023",
    people: { en: "Denise (34) and her kids Jaylen (9), Amara (6) and Malik (2)", es: "Denise (34) y sus hijos Jaylen (9), Amara (6) y Malik (2)" },
    home: { en: "Rents an apartment in the East End. No renters insurance.", es: "Renta un apartamento en el East End. Sin seguro de inquilino." },
    money: { en: "About $2,350 a month as a cashier, paid every two weeks", es: "Unos $2,350 al mes como cajera, con pago cada dos semanas" },
    damage: { en: "Rain through the kids' ceiling, mold, food lost. Amara's nebulizer needs power. FEMA said no.", es: "Lluvia por el techo del cuarto de los niños, moho, comida perdida. El nebulizador de Amara necesita luz. FEMA dijo que no." },
  },
  {
    id: "nguyen",
    name: "Nguyen household",
    address: "6127 Bissonnet St, Houston, TX 77081",
    people: { en: "Minh (67) and his wife Lan (64), both retired", es: "Minh (67) y su esposa Lan (64), los dos jubilados" },
    home: { en: "Own their house outright in Gulfton. Insured, with a $4,800 hurricane deductible.", es: "Dueños de su casa ya pagada en Gulfton. Asegurados, con un deducible por huracán de $4,800." },
    money: { en: "About $2,900 a month from Social Security, $6,400 in savings", es: "Unos $2,900 al mes del Seguro Social, $6,400 en ahorros" },
    damage: { en: "An oak tree crushed the garage, the roof lost shingles, rain in the back bedroom.", es: "Un roble aplastó el garaje, el techo perdió tejas y entró lluvia al cuarto de atrás." },
  },
];

export const isDemoId = (x: unknown): x is DemoId => DEMO_CARDS.some((d) => d.id === x);
