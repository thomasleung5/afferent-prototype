import { Page, PageHeader } from "@/components/layout";
import { ComingSoon } from "@/features/_shared/ComingSoon";

export default function AnnualPacketPage() {
  return (
    <Page>
      <PageHeader eyebrow="Annual update" title="Update packet"/>
      <ComingSoon legacyFile="screens-annual.jsx (AnnualPacketScreen)"/>
    </Page>
  );
}
