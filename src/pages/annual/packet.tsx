import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, SectionEyebrow } from "@/components/ui";
import { UpdatePacketView } from "@/features/annual/UpdatePacketView";

export default function AnnualPacketPage() {
  return (
    <Page>
      <PageHeader
        eyebrow={<SectionEyebrow prefix="Annual Update" label="Update packet"/>}
        title="Annual update packet"
        subtitle="Council outputs assembled from the model run."
        actions={<>
          <Btn kind="ghost"><Icon name="download" size={13}/> Export staff report</Btn>
          <Btn kind="primary"><Icon name="download" size={13}/> Export packet</Btn>
        </>}
      />
      <UpdatePacketView/>
    </Page>
  );
}
