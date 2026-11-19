// The privacy policy, in the newspaper format. Every statement describes what
// the code actually does (store.ts, cases.ts, files.ts, CaseApp.tsx, the API
// routes); update this page whenever that changes.

import type { Article, Flowchart } from "./article";
import type { Lang } from "@/components/landing/strings";


const FLOW: Record<Lang, Flowchart> = {
  en: {
    title: "Flowchart 1. Where your papers go",
    rows: [
      { nodes: [{ title: "Your device", sub: "A photo is shrunk to 1,600 px and re-saved, which drops its location", tone: "plain" }], edge: "sent to the server" },
      { nodes: [{ title: "BayouBridge’s memory", sub: "A random case ID. No database, no files on disk." }] },
      { nodes: [
        { tag: "Only photos, PDFs and text, and only when the photo reader is on", title: "Claude, by Anthropic", sub: "Reads them and sends back what it found" },
        { tag: "Only after you approve", title: "Practice outbox", sub: "Drafts stay inside BayouBridge. Nothing goes to FEMA, insurers or anyone else." },
      ], edge: "then, whichever comes first" },
      { nodes: [{ title: "Deleted", sub: "2 hours after you last use it, the moment you press “Delete my case”, or when the server restarts", tone: "sun" }] },
    ],
    note: "If you speak instead of type, your browser’s own speech service turns your voice into text before anything reaches BayouBridge.",
  },
  es: {
    title: "Diagrama 1. A dónde van sus papeles",
    rows: [
      { nodes: [{ title: "Su dispositivo", sub: "Una foto se reduce a 1.600 px y se vuelve a guardar, lo que quita su ubicación", tone: "plain" }], edge: "enviado al servidor" },
      { nodes: [{ title: "La memoria de BayouBridge", sub: "Un identificador de caso aleatorio. Sin base de datos ni archivos en disco." }] },
      { nodes: [
        { tag: "Solo fotos, PDF y texto, y solo si el lector de fotos está activo", title: "Claude, de Anthropic", sub: "Los lee y devuelve lo que encontró" },
        { tag: "Solo después de que usted apruebe", title: "Bandeja de práctica", sub: "Los borradores se quedan dentro de BayouBridge. Nada llega a FEMA, aseguradoras ni nadie más." },
      ], edge: "luego, lo que ocurra primero" },
      { nodes: [{ title: "Borrado", sub: "2 horas después de su último uso, al instante con “Borrar mi caso”, o al reiniciar el servidor", tone: "sun" }] },
    ],
    note: "Si habla en vez de escribir, el servicio de voz de su propio navegador convierte su voz en texto antes de que algo llegue a BayouBridge.",
  },
};

const en: Article = {
  masthead: ["BayouBridge Houston", "Privacy Policy", "November 2026"],
  title: "Your Papers",
  deck: ["What we keep, for how long, who else sees it,", "and how to make it all disappear."],
  ticker: [
    "No accounts", "No ads or trackers", "No database", "Deleted after 2 hours", "Delete any time",
    "Nothing sent without your OK", "Location data stripped from photos", "Never sold, never shared with agencies",
  ],
  sections: [
    {
      heading: "What do we collect?",
      paragraphs: [
        "Only what you give us to work on your case. When you start a case we ask for the address of the damaged home, which we use to check that your bills and letters match it, and a name for your household if you want one. Then the papers you add: photos, PDFs or text files, up to 10 of them at 8 MB each, and anything you type or say in “your own words.”",
        "When we read a paper we also keep what we found in it: the kind of document, a short title, the lines that matter for recovery and the details pulled from them. That is what the plan, the drafts and the next question are built from.",
        "We don’t ask for an email, a phone number, a password or an ID number to use BayouBridge, and there are no accounts.",
      ],
    },
    {
      heading: "Where is it kept, and for how long?",
      flow: FLOW.en,
      paragraphs: [
        "In the memory of the one server that runs BayouBridge, and nowhere else. There is no database and nothing is written to disk. Your case lives under a random identifier that can’t be guessed.",
        "Everything about your case, including every file, is deleted two hours after you last use it. You can delete it sooner at any moment with “Delete my case” in the menu, and it is gone at once. Restarting the server also wipes every case. To keep memory in check we hold at most 200 cases; if there are more, the least recently used is deleted first.",
      ],
      figure: {
        title: "Figure 1. How long your case stays on our server",
        bars: [
          { label: "If you do nothing", value: 120, display: "2 hours", tone: "tide" },
          { label: "After “Delete my case”", value: 3, display: "Right away", tone: "sun" },
          { label: "After a server restart", value: 3, display: "Right away", tone: "sun" },
          { label: "Copies on disk or in a database", value: 3, display: "None, ever", tone: "sun" },
        ],
        note: "The two-hour clock restarts each time you use your case. Approved drafts are deleted with it.",
      },
    },
    {
      heading: "Who else sees my papers?",
      paragraphs: [
        "To read photos, PDFs and text, BayouBridge sends them to Claude, an AI made by Anthropic, through Anthropic’s API, and Anthropic’s API terms and privacy policy apply to that request. If the server running BayouBridge has no API key, your papers are not sent anywhere and are not read; the case tells you so.",
        "If you use the microphone button to speak instead of type, your browser turns your voice into text using its own speech service. In Chrome, that service is run by Google. Typing avoids it.",
        "No one else. We never send anything to FEMA, your insurer, a utility, a lender or any other agency. Drafts you approve go to a practice outbox inside BayouBridge and stay there. We don’t sell your information, show ads, or use analytics or advertising trackers.",
      ],
    },
    {
      heading: "What stays in my browser?",
      paragraphs: [
        "Two small things. Your language choice is saved in your browser’s local storage so the site remembers English or Spanish. Your case’s identifier is saved in session storage for that tab, so reloading the page brings your case back; it is cleared when you close the tab or delete the case. BayouBridge sets no cookies.",
        "Before a photo leaves your device, your browser shrinks it to 1,600 pixels on its longest side and saves it again. That also removes hidden data cameras add, including the location where the photo was taken. PDFs, text files and GIF images are sent as they are.",
      ],
    },
    {
      heading: "What about the example family?",
      paragraphs: [
        "The Reyes household on the home page and in “the example case” is made up, along with their papers, their insurer and the storm. Opening the example creates a private copy just for you, which is deleted the same way as any other case. Nothing you do there is seen by anyone else.",
      ],
    },
    {
      heading: "Anything else I should know?",
      paragraphs: [
        "BayouBridge is a prototype built for Teen Hacks Houston. It suggests help you may qualify for and drafts paperwork; it never decides eligibility and never submits anything. Please only add papers that are yours or that you have permission to share, and avoid adding things the case doesn’t need, like full Social Security numbers or bank logins.",
        "Our server logs record when something goes wrong, but never the text of your papers. If this policy changes, the new version will be posted on this page with its date.",
      ],
    },
  ],
  colophon: "Last updated November 2026. This policy describes how the BayouBridge prototype works today.",
  back: "← Back to BayouBridge",
};

const es: Article = {
  masthead: ["BayouBridge Houston", "Política de Privacidad", "Noviembre 2026"],
  title: "Sus Papeles",
  deck: ["Qué guardamos, por cuánto tiempo, quién más lo ve,", "y cómo hacer que todo desaparezca."],
  ticker: [
    "Sin cuentas", "Sin anuncios ni rastreadores", "Sin base de datos", "Se borra a las 2 horas", "Bórrelo cuando quiera",
    "Nada se envía sin su permiso", "Las fotos pierden su ubicación", "Nunca se vende ni se comparte con agencias",
  ],
  sections: [
    {
      heading: "¿Qué recopilamos?",
      paragraphs: [
        "Solo lo que usted nos da para trabajar su caso. Al empezar le pedimos la dirección de la casa dañada, que usamos para comprobar que sus facturas y cartas coinciden, y un nombre para su hogar si lo desea. Luego los papeles que agregue: fotos, PDF o archivos de texto, hasta 10 de 8 MB cada uno, y lo que escriba o diga “en sus propias palabras”.",
        "Al leer un papel también guardamos lo que encontramos: el tipo de documento, un título corto, las líneas importantes y los datos que salen de ellas. Con eso se arman el plan, los borradores y la siguiente pregunta.",
        "No pedimos correo, teléfono, contraseña ni número de identificación para usar BayouBridge, y no hay cuentas.",
      ],
    },
    {
      heading: "¿Dónde se guarda y por cuánto tiempo?",
      flow: FLOW.es,
      paragraphs: [
        "En la memoria del único servidor que corre BayouBridge, y en ningún otro lugar. No hay base de datos y nada se escribe en disco. Su caso vive bajo un identificador aleatorio imposible de adivinar.",
        "Todo lo de su caso, incluidos los archivos, se borra dos horas después de su último uso. Puede borrarlo antes en cualquier momento con “Borrar mi caso” en el menú, y desaparece al instante. Reiniciar el servidor también borra todos los casos. Guardamos como máximo 200 casos; si hay más, se borra primero el que lleva más tiempo sin usarse.",
      ],
      figure: {
        title: "Figura 1. Cuánto tiempo queda su caso en el servidor",
        bars: [
          { label: "Si no hace nada", value: 120, display: "2 horas", tone: "tide" },
          { label: "Tras “Borrar mi caso”", value: 3, display: "Al instante", tone: "sun" },
          { label: "Tras reiniciar el servidor", value: 3, display: "Al instante", tone: "sun" },
          { label: "Copias en disco o base de datos", value: 3, display: "Ninguna, nunca", tone: "sun" },
        ],
        note: "El reloj de dos horas se reinicia cada vez que usa su caso. Los borradores aprobados se borran con él.",
      },
    },
    {
      heading: "¿Quién más ve mis papeles?",
      paragraphs: [
        "Para leer fotos, PDF y textos, BayouBridge los envía a Claude, una IA de Anthropic, mediante la API de Anthropic, y a esa solicitud se aplican los términos y la política de privacidad de la API de Anthropic. Si el servidor no tiene clave de API, sus papeles no se envían a ningún lado ni se leen; el caso se lo dice.",
        "Si usa el botón del micrófono para hablar en vez de escribir, su navegador convierte su voz en texto con su propio servicio. En Chrome, ese servicio es de Google. Escribir lo evita.",
        "Nadie más. Nunca enviamos nada a FEMA, a su aseguradora, a la compañía de servicios, a un prestamista ni a ninguna agencia. Los borradores que aprueba van a una bandeja de práctica dentro de BayouBridge y se quedan ahí. No vendemos su información, no mostramos anuncios ni usamos rastreadores.",
      ],
    },
    {
      heading: "¿Qué queda en mi navegador?",
      paragraphs: [
        "Dos cosas pequeñas. Su idioma se guarda en el almacenamiento local del navegador para recordar inglés o español. El identificador de su caso se guarda en el almacenamiento de sesión de esa pestaña, para que al recargar vuelva su caso; se borra al cerrar la pestaña o al borrar el caso. BayouBridge no usa cookies.",
        "Antes de que una foto salga de su dispositivo, el navegador la reduce a 1.600 píxeles en su lado más largo y la vuelve a guardar. Eso también quita datos ocultos que agregan las cámaras, incluida la ubicación donde se tomó. Los PDF, los textos y las imágenes GIF se envían tal cual.",
      ],
    },
    {
      heading: "¿Y la familia de ejemplo?",
      paragraphs: [
        "El hogar Reyes de la página principal y del “caso de ejemplo” es inventado, igual que sus papeles, su aseguradora y la tormenta. Abrir el ejemplo crea una copia privada solo para usted, que se borra igual que cualquier otro caso. Nadie más ve lo que hace ahí.",
      ],
    },
    {
      heading: "¿Algo más que deba saber?",
      paragraphs: [
        "BayouBridge es un prototipo hecho para Teen Hacks Houston. Sugiere ayuda para la que podría calificar y prepara papeleo; nunca decide si usted califica y nunca envía nada. Por favor agregue solo papeles suyos o que tenga permiso de compartir, y evite lo que el caso no necesita, como números de Seguro Social completos o claves bancarias.",
        "Los registros del servidor anotan cuando algo falla, pero nunca el texto de sus papeles. Si esta política cambia, la nueva versión aparecerá en esta página con su fecha.",
      ],
    },
  ],
  colophon: "Actualizada en noviembre de 2026. Esta política describe cómo funciona hoy el prototipo de BayouBridge.",
  back: "← Volver a BayouBridge",
};

export const PRIVACY: Record<Lang, Article> = { en, es };
