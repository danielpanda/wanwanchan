import type { Reminder } from "./types";

export type Lang = "id" | "en";

const LINES = {
  id: {
    water: ["Minum dulu yuk", "Udah minum belum? Aku haus nih~", "Glek glek... giliran kamu minum!"],
    eyes: ["Istirahatin mata 20 detik, lihat yang jauh ya", "20-20-20! Tatap sesuatu yang jauh 20 detik", "Matanya capek lho, kedip-kedip dulu"],
    posture: ["Tegakkan badan! Punggungmu bilang makasih", "Bahu turun, punggung lurus", "Cek postur dulu yuk, jangan bungkuk"],
    stretch: ["Berdiri, regangin badan sebentar yuk", "Jalan-jalan 2 menit, nanti lanjut lagi", "Nyem~ regangin tangan dan leher dulu"],
    lunch: ["Waktunya makan siang!", "Perut bunyi... makan dulu yuk"],
    sleep: ["Udah malam... tidur yuk", "Besok lanjut lagi, istirahat dulu ya"],
    custom: ["Pengingat dari anjing"],
    morning: ["Selamat pagi! Semangat hari ini", "Pagi~ udah sarapan belum?"],
    noon: ["Halo siang! Jangan lupa makan", "Siang-siang gini enaknya minum yang dingin"],
    evening: ["Selamat sore! Hampir selesai nih", "Sore~ tinggal sedikit lagi, semangat!"],
    night: ["Selamat malam! Jangan begadang ya", "Malam~ aku temenin deh"],
    welcome: ["Kamu balik! Kangen tau", "Akhirnya datang juga~", "Hai hai! Aku nungguin lho"],
    chatter: ["Lagi ngapain?", "Aku lapar... (tapi bohong)", "Guk guk!", "Kamu keren hari ini", "Boleh minta elus?", "Aku jagain desktop kamu", "Hmm... enaknya tidur siang ya", "Jangan lupa senyum", "Ada yang bisa aku bantu? (cuma lucu aja sih)"],
    agentDone: ["Selesai!", "Tugasnya beres!", "Yeay, sudah kelar!"],
    agentError: ["Waduh, ada error nih", "Aduh... ada yang gagal"],
    agentWait: ["Aku butuh kamu nih", "Menunggu jawabanmu~"],
    praise: ["Rajin banget! Udah lama ngetik, istirahat dulu yuk", "Jarimu hebat! Tapi minum dulu ya"],
    ouch: ["Geli ih!", "Hehe jangan dipencet terus~", "Guk!"],
    purr: ["Hehe, enak~", "Aduh, nyaman banget...", "Nyaman banget~"],
    snooze: ["Oke, nanti aku ingetin lagi", "Siap, 10 menit lagi ya"],
    sit: ["Duduk manis~", "Oke, aku duduk di sini ya"],
    stand: ["Yuk jalan lagi!", "Bebas deh~"],
    pomoFocus: ["Fokus {m} menit, mulai! Aku jagain"],
    pomoBreak: ["Fokus selesai! Istirahat {m} menit"],
    pomoLong: ["Kerja bagus! Istirahat panjang {m} menit"],
    pomoStop: ["Pomodoro berhenti. Sesi selesai: {n}"],
    ok: "OK", later: "Nanti 10m",
  },
  en: {
    water: ["Time for a sip of water", "Have you had water yet? I'm thirsty~", "Glug glug... your turn!"],
    eyes: ["Rest your eyes: look far away for 20 seconds", "20-20-20! Stare at something distant", "Blink a little, your eyes are tired"],
    posture: ["Sit up straight! Your back says thanks", "Shoulders down, back straight", "Posture check, no slouching"],
    stretch: ["Stand up and stretch for a moment", "Take a two-minute walk", "Stretch your arms and neck"],
    lunch: ["Lunch time!", "Tummy rumbling... let's eat"],
    sleep: ["It's late... time for bed", "Pick it up tomorrow, rest now"],
    custom: ["A reminder from your dog"],
    morning: ["Good morning! Have a great day", "Morning~ had breakfast yet?"],
    noon: ["Good afternoon! Don't forget lunch", "Something cold would be nice"],
    evening: ["Good evening! Almost done", "Just a little more, you can do it"],
    night: ["Good night! Don't stay up too late", "I'll keep you company"],
    welcome: ["You're back! I missed you", "Finally~ I was waiting", "Hi hi!"],
    chatter: ["What are you up to?", "I'm hungry... (not really)", "Woof!", "You're doing great today", "Can I get a pat?", "I'm guarding your desktop", "A nap sounds nice", "Don't forget to smile", "Need anything? (I'm only cute)"],
    agentDone: ["All done!", "Task finished!", "Yay, it's ready!"],
    agentError: ["Uh-oh, an error", "Something failed..."],
    agentWait: ["I need you", "Waiting for your answer~"],
    praise: ["So diligent! Take a break soon", "Great typing! Drink some water too"],
    ouch: ["That tickles!", "Hehe stop poking~", "Guk!"],
    purr: ["Hehe, nice~", "Ahh, so good...", "So cozy~"],
    snooze: ["Okay, I'll remind you later", "Got it, 10 more minutes"],
    sit: ["Sitting pretty~", "Okay, I'll stay right here"],
    stand: ["Let's roam again!", "Free at last~"],
    pomoFocus: ["Focus for {m} minutes, go! I'll keep watch"],
    pomoBreak: ["Focus done! Take a {m}-minute break"],
    pomoLong: ["Great work! Long break: {m} minutes"],
    pomoStop: ["Pomodoro stopped. Sessions done: {n}"],
    ok: "OK", later: "Later 10m",
  },
} as const;

export type LineKey = Exclude<keyof (typeof LINES)["id"], "ok" | "later">;

export function pick(lang: Lang, key: LineKey, rnd: () => number = Math.random): string {
  const arr = LINES[lang][key] as readonly string[];
  return arr[Math.floor(rnd() * arr.length) % arr.length];
}

/** "Minum dulu yuk" -> "Dani, minum dulu yuk" when the user told us their name. */
export function withName(text: string, name: string): string {
  const n = name.trim();
  if (!n) return text;
  const lead = /^\p{Extended_Pictographic}️?\s*/u.exec(text)?.[0] ?? "";
  const rest = text.slice(lead.length);
  const keepCase = /^I\b/.test(rest); // English "I'm", "I'll"
  return `${lead}${n}, ${keepCase ? rest.charAt(0) : rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
}

export const buttonLabels = (lang: Lang) => ({ ok: LINES[lang].ok, later: LINES[lang].later });

export function reminderText(r: Reminder, lang: Lang, rnd: () => number = Math.random): string {
  if (r.text.trim()) return `${r.emoji} ${r.text.trim()}`.trim();
  const key = (r.builtin && r.id in LINES[lang] ? r.id : "custom") as LineKey;
  return pick(lang, key, rnd);
}

export const REMINDER_NAMES: Record<Lang, Record<string, string>> = {
  id: { water: "Minum air", eyes: "Istirahat mata (20-20-20)", posture: "Cek postur", stretch: "Peregangan", lunch: "Makan siang", sleep: "Waktu tidur" },
  en: { water: "Drink water", eyes: "Eye rest (20-20-20)", posture: "Posture check", stretch: "Stretch", lunch: "Lunch", sleep: "Bedtime" },
};

export function timeGreeting(date: Date, lang: Lang, rnd: () => number = Math.random): string {
  const h = date.getHours();
  const key: LineKey = h >= 5 && h < 11 ? "morning" : h < 15 ? "noon" : h < 18 ? "evening" : "night";
  return pick(lang, key, rnd);
}

export const AGENT_LABEL: Record<string, string> = {
  claude: "Claude Code", shell: "Terminal", codex: "Codex", cursor: "Cursor", antigravity: "Antigravity", opencode: "OpenCode", custom: "Agent", test: "Test",
};
