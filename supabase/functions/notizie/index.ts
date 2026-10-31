// Capodanno - notizie dal mondo (Supabase Edge Function).
// Legge i feed RSS dei grandi giornali italiani e internazionali, raggruppa le notizie raccontate da più testate
// (le più importanti sono quelle che compaiono ovunque) e chiede a Claude una sintesi neutrale in italiano,
// solo con i fatti presenti negli articoli. Il risultato va nella tabella «news», letta dall'app.
// La chiama il cron ogni tre ore. Segreto richiesto: ANTHROPIC_API_KEY. «Verify JWT» va disattivato.

import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.117.0";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const FEEDS: [string, string][] = [
  ["ANSA", "https://www.ansa.it/sito/notizie/topnews/topnews_rss.xml"],
  ["Corriere della Sera", "https://xml2.corriereobjects.it/rss/homepage.xml"],
  ["la Repubblica", "https://www.repubblica.it/rss/homepage/rss2.0.xml"],
  ["Il Post", "https://www.ilpost.it/feed/"],
  ["Il Sole 24 Ore", "https://www.ilsole24ore.com/rss/mondo.xml"],
  ["Rai News", "https://www.rainews.it/rss/tutti"],
  ["BBC News", "https://feeds.bbci.co.uk/news/world/rss.xml"],
  ["The Guardian", "https://www.theguardian.com/world/rss"],
  ["The New York Times", "https://rss.nytimes.com/services/xml/rss/nyt/World.xml"],
  ["Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"],
  ["Deutsche Welle", "https://rss.dw.com/rdf/rss-en-world"],
  ["Le Monde", "https://www.lemonde.fr/international/rss_full.xml"],
];

interface Item { src: string; title: string; link: string; desc: string; img?: string; at: number; words: Set<string> }

const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\s+/g, " ").trim();
const tag = (x: string, t: string) => x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i"))?.[1] ?? "";
const STOP = new Set("della delle dello degli nella nelle sulla sulle dalla dopo prima oltre anche ancora sono stato stata come quando mentre perche contro verso sopra sotto senza questo questa quello quella their there about after before from with will have been were which what more than over into against says said news live update world video foto".split(" "));
const words = (s: string) => new Set(s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").split(" ").filter((w) => w.length > 3 && !STOP.has(w)));

async function fetchFeed([src, url]: [string, string]): Promise<Item[]> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (CapodannoApp news reader)" }, signal: AbortSignal.timeout(9000) });
    if (!r.ok) return [];
    const xml = await r.text();
    const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) ?? [];
    return blocks.slice(0, 40).map((b) => {
      const title = decode(tag(b, "title"));
      const link = decode(tag(b, "link")) || b.match(/<link[^>]+href="([^"]+)"/i)?.[1] || "";
      const desc = decode(tag(b, "description") || tag(b, "summary")).slice(0, 400);
      const img = b.match(/<media:(?:content|thumbnail)[^>]+url="([^"]+)"/i)?.[1] || b.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image/i)?.[1] || b.match(/<img[^>]+src="([^"]+)"/i)?.[1];
      const when = Date.parse(decode(tag(b, "pubDate") || tag(b, "dc:date") || tag(b, "updated") || tag(b, "published")));
      return { src, title, link, desc, img: img?.replace(/&amp;/g, "&"), at: Number.isNaN(when) ? Date.now() : when, words: words(title + " " + desc.slice(0, 160)) };
    }).filter((i) => i.title && i.link);
  } catch { return []; }
}

// Raggruppa le notizie simili: più testate diverse = notizia più importante.
function cluster(items: Item[]) {
  const groups: { items: Item[]; words: Set<string> }[] = [];
  for (const it of items) {
    let best: typeof groups[number] | null = null, bestScore = 0;
    for (const g of groups) {
      let common = 0; for (const w of it.words) if (g.words.has(w)) common++;
      const score = common / Math.max(1, Math.min(it.words.size, g.words.size));
      if (common >= 3 && score > bestScore) { best = g; bestScore = score; }
    }
    if (best && bestScore >= 0.3) { best.items.push(it); for (const w of it.words) best.words.add(w); }
    else groups.push({ items: [it], words: new Set(it.words) });
  }
  return groups.map((g) => ({ ...g, sources: new Set(g.items.map((i) => i.src)).size, fresh: Math.max(...g.items.map((i) => i.at)) }))
    .sort((a, b) => b.sources - a.sources || b.fresh - a.fresh);
}

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["notizie"],
  properties: {
    notizie: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["gruppi", "titolo", "sintesi", "categoria"],
        properties: {
          gruppi: { type: "array", items: { type: "integer" }, description: "Numeri dei gruppi che raccontano questa notizia" },
          titolo: { type: "string" }, sintesi: { type: "string" }, categoria: { type: "string" },
        },
      },
    },
  },
};

async function refresh() {
  const all = (await Promise.all(FEEDS.map(fetchFeed))).flat().filter((i) => Date.now() - i.at < 36 * 3600e3);
  const groups = cluster(all).slice(0, 18);
  if (!groups.length) return 0;
  const list = groups.map((g, n) => `GRUPPO ${n} (${g.sources} testate)\n${g.items.slice(0, 5).map((i) => `- ${i.src}: ${i.title}${i.desc ? ` — ${i.desc.slice(0, 220)}` : ""}`).join("\n")}`).join("\n\n");
  const res = await anthropic.messages.create({
    model: "claude-opus-5-5", max_tokens: 6000,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: "Sei il redattore di una rassegna stampa seria. Scrivi in italiano, tono neutro e preciso, nessuna opinione. Usa SOLO i fatti presenti nei titoli e nelle descrizioni che ricevi: non aggiungere numeri, nomi o dettagli che non ci sono. Niente gossip, sport, oroscopi, curiosità o cronaca minore: solo notizie importanti (politica, esteri, economia, scienza, ambiente, grandi fatti italiani).",
    messages: [{ role: "user", content: `Ecco le notizie delle ultime ore raggruppate per argomento, con il numero di testate che le riportano. Scegli le 7 più importanti (dai precedenza a quelle riportate da più testate e a un buon equilibrio tra Italia e mondo). Unisci i gruppi che raccontano la stessa notizia. Per ognuna: titolo breve e chiaro, sintesi di due o tre frasi, categoria in una parola (Mondo, Italia, Europa, Economia, Scienza, Ambiente, Tecnologia).\n\n${list}` }],
    // deno-lint-ignore no-explicit-any
  } as any);
  // deno-lint-ignore no-explicit-any
  const text = (res.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("");
  const parsed = JSON.parse(text);
  const items = (parsed.notizie ?? []).slice(0, 8).map((n: { gruppi: number[]; titolo: string; sintesi: string; categoria: string }) => {
    const its = n.gruppi.flatMap((k) => groups[k]?.items ?? []);
    const seen = new Set<string>();
    const fonti = its.filter((i) => !seen.has(i.src) && seen.add(i.src)).slice(0, 6).map((i) => ({ nome: i.src, url: i.link, titolo: i.title }));
    const immagine = its.find((i) => i.img && /^https:/.test(i.img))?.img ?? null;
    return { titolo: n.titolo, sintesi: n.sintesi, categoria: n.categoria, fonti, immagine };
  }).filter((n: { fonti: unknown[] }) => n.fonti.length);
  if (items.length) await db.from("news").upsert({ id: 1, items, updated_at: new Date().toISOString() });
  return items.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { data: secret } = await db.from("app_secrets").select("value").eq("key", "cron").maybeSingle();
    const fromCron = secret && req.headers.get("x-cron") === secret.value;
    if (!fromCron) {
      // Un membro può chiedere un aggiornamento, ma non più di uno ogni mezz'ora.
      const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      const { data: auth } = await db.auth.getUser(jwt);
      if (!auth?.user) return json({ error: "Non autenticato" }, 401);
      const { data: n } = await db.from("news").select("updated_at,items").eq("id", 1).maybeSingle();
      if (n && (n.items as unknown[]).length && Date.now() - Date.parse(n.updated_at) < 30 * 60e3) return json({ ok: true, cached: true });
    }
    return json({ ok: true, items: await refresh() });
  } catch (err) {
    console.error(err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});
