
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { OperatingSummary } from "@/features/build/OperatingSummary";
import { OperatingTable } from "@/features/build/OperatingTable";

export default function OperatingPage() {
  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="operating"/>}
        title="Operating"
        subtitle="Department non-labor spend."
        actions={
          <Btn kind="ghost" href="/annual/refresh">
            <Icon name="arrow-up-to-line" size={13}/> Re-import
          </Btn>
        }
      />

      <OperatingSummary/>

      <OperatingTable/>
    </Page>
  );
}
