
import { Page, PageHeader } from "@/components/layout";
import { Btn, Icon, NodeEyebrow } from "@/components/ui";
import { ServicesTable } from "@/features/build/ServicesTable";

export default function ServicesPage() {
  return (
    <Page>
      <PageHeader
        eyebrow={<NodeEyebrow node="services"/>}
        title="Services"
        subtitle="Service definitions, hours, and staffing."
        actions={
          <Btn kind="ghost" href="/source-data#services">
            <Icon name="arrow-up-to-line" size={13}/> Import Data
          </Btn>
        }
      />

      <ServicesTable/>
    </Page>
  );
}
