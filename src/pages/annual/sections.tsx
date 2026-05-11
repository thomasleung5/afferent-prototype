import { useState } from "react";
import { Page, PageHeader } from "@/components/layout";
import { AnnualEyebrow } from "@/features/annual/AnnualEyebrow";
import { SectionPicker } from "@/features/annual/SectionPicker";
import { SectionReviewTable } from "@/features/annual/SectionReviewTable";
import { SECTIONS, type SectionKey } from "@/lib/data/annual";

export default function AnnualSectionsPage() {
  const firstWithReview = SECTIONS.find((s) => s.needsReview > 0)?.k ?? SECTIONS[0].k;
  const [activeSection, setActiveSection] = useState<SectionKey>(firstWithReview);
  const meta = SECTIONS.find((s) => s.k === activeSection)!;

  return (
    <Page>
      <PageHeader
        eyebrow={<AnnualEyebrow role="Section review" label={meta.label}/>}
        title={meta.label}
        subtitle={meta.sub}
      />
      <SectionPicker value={activeSection} onChange={setActiveSection}/>
      <SectionReviewTable sectionKey={activeSection}/>
    </Page>
  );
}
