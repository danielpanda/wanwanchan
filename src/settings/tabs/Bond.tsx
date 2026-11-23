import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ACCESSORIES, levelOf, XP } from "../../shared/bond";
import type { BondState } from "../../shared/types";
import { Group, Page, Row, Toggle } from "../ui";
import type { TabProps } from "./types";

export function BondTab({ settings: s, update }: TabProps) {
  const [bond, setBond] = useState<BondState>(s.bond);
  useEffect(() => {
    const un = listen<BondState>("bond-changed", (e) => setBond(e.payload));
    return () => { void un.then((u) => u()); };
  }, []);
  const lv = levelOf(Math.max(bond.xp, s.bond.xp));
  const lang = s.notify.language;
  const pct = lv.need ? Math.round((lv.into / lv.need) * 100) : 100;
  const toggle = (id: string, on: boolean) => update({ accessories: on ? [...s.accessories.filter((a) => a !== id), id] : s.accessories.filter((a) => a !== id) });

  return (
    <Page title="Bond">
      <Group>
        <div className="p-5 text-center">
          <div className="text-[22px] font-bold">Level {lv.level}</div>
          <div className="mx-auto mt-2 h-2 w-64 rounded-full" style={{ background: "var(--field)" }}>
            <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: "var(--accent)", transition: "width .3s" }} />
          </div>
          <div className="desc mt-1" style={{ color: "var(--sub)" }}>
            {lv.need ? `${lv.into} / ${lv.need} XP to the next level` : "Max level, best friends forever"}
            {bond.streak > 0 ? ` · ${bond.streak}-day streak` : ""}
          </div>
        </div>
      </Group>

      <Group title="Accessories">
        {ACCESSORIES.map((a) => {
          const open = lv.level >= a.level;
          return (
            <Row key={a.id} label={a.name[lang]} desc={open ? "Unlocked" : `Unlocks at level ${a.level}`}>
              <Toggle value={s.accessories.includes(a.id) && open} disabled={!open} onChange={(v) => toggle(a.id, v)} />
            </Row>
          );
        })}
      </Group>
      <div className="desc mt-2" style={{ color: "var(--sub)" }}>Accessories appear on the bundled characters (Pixel Frenchie, Kuro, Shiro, Abu, Bunny, Puppy). Imported characters keep their own look.</div>

      <Group title="How to earn XP">
        <Row label="Daily visit" desc="First launch each day, plus a streak bonus (up to +7)"><span style={{ color: "var(--sub)" }}>+{XP.daily.amount}</span></Row>
        <Row label="Finish a focus session"><span style={{ color: "var(--sub)" }}>+{XP.focus.amount}</span></Row>
        <Row label="Acknowledge a reminder (OK)"><span style={{ color: "var(--sub)" }}>+{XP.reminder.amount}</span></Row>
        <Row label="AI agent finishes a task"><span style={{ color: "var(--sub)" }}>+{XP.agent.amount}</span></Row>
        <Row label="Pet it (hover) / poke it" desc="Daily limits apply, so no grinding."><span style={{ color: "var(--sub)" }}>+{XP.pet.amount} / +{XP.click.amount}</span></Row>
      </Group>
    </Page>
  );
}
