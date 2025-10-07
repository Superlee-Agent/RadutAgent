import DashboardLayout from "@/components/layout/DashboardLayout";
import ComingSoon from "@/components/common/ComingSoon";

const IPFI_AVATAR =
  "https://cdn.builder.io/api/v1/image/assets%2Fc692190cfd69486380fecff59911b51b%2F885c66a9b5da433b9a8c619e8679d4c7";

const IpfiAssistant = () => (
  <DashboardLayout title="IPFi Assistant" avatarSrc={IPFI_AVATAR}>
    <ComingSoon
      title="IPFi Assistant"
      description="The IPFi Assistant experience is in development. Check back soon for powerful financial tooling tailored to your intellectual property needs."
    />
  </DashboardLayout>
);

export default IpfiAssistant;
