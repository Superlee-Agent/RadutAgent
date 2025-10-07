import DashboardLayout from "@/components/layout/DashboardLayout";
import ComingSoon from "@/components/common/ComingSoon";

const NFT_MARKETPLACE_AVATAR =
  "https://cdn.builder.io/api/v1/image/assets%2Fc692190cfd69486380fecff59911b51b%2F0d3447c43fc845a9b19c1b07b9b03083";

const NftMarketplace = () => (
  <DashboardLayout title="NFT Marketplace" avatarSrc={NFT_MARKETPLACE_AVATAR}>
    <ComingSoon
      title="NFT Marketplace"
      description="Discover, list, and trade IP-backed NFTs in one unified marketplace. This feature is almost ready—stay tuned!"
    />
  </DashboardLayout>
);

export default NftMarketplace;
