import { useState } from "react";
import { Btn, Icon } from "@/components/ui";
import { useBuildState, type StudyVersionStatus } from "@/lib/store";

function packetLabel(status: StudyVersionStatus): string {
  const d = new Date();
  const stamp = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (status === "adopted") return `Adopted packet · ${stamp}`;
  return `Review packet · ${stamp}`;
}

export function SaveVersionActions() {
  const state = useBuildState();
  const [saved, setSaved] = useState<"review" | "adopted" | null>(null);

  const save = (status: Extract<StudyVersionStatus, "review" | "adopted">) => {
    const created = state.createVersion({
      label: packetLabel(status),
      status,
      notes: status === "adopted"
        ? "Formal adopted packet snapshot."
        : "Review packet snapshot for annual update changes.",
    });
    state.setComparisonVersion(created.id);
    setSaved(status);
    window.setTimeout(() => setSaved(null), 2400);
  };

  return (
    <>
      <Btn kind="ghost" onClick={() => save("review")}>
        <Icon name="database" size={13}/>
        {saved === "review" ? "Saved review version" : "Save review version"}
      </Btn>
      <Btn kind="ghost" onClick={() => save("adopted")}>
        <Icon name="check" size={13}/>
        {saved === "adopted" ? "Saved adopted version" : "Mark adopted"}
      </Btn>
    </>
  );
}
