
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { VolumeTable } from "@/features/build/VolumeTable";

export default function VolumePage() {
  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="volume"/>}
        title="Volume of Activity"
        subtitle="Annual volume per service."
        actions={
          <Btn kind="ghost" href="/annual/refresh">
            <Icon name="arrow-up-to-line" size={13}/> Re-import
          </Btn>
        }
      />

      <VolumeTable/>
    </Page>
  );
}
