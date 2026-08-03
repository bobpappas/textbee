import OrganizationProfile from './organization-profile'

export default async function OrganizationProfilePage({
  params,
}: {
  params: Promise<{ organizationId: string }>
}) {
  const { organizationId } = await params
  return <OrganizationProfile organizationId={organizationId} />
}
