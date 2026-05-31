
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { VolumeTable } from "@/features/build/VolumeTable";

export default function VolumePage() {
  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="volume"/>}
        title="Volume of Activity"
        subtitle="Annual service demand and volumes."
        actions={
          <Btn kind="ghost" href="/source-data#volume">
            <Icon name="arrow-up-to-line" size={13}/> Import Data
          </Btn>
        }
      />

      <VolumeTable/>
    </Page>
  );
}
