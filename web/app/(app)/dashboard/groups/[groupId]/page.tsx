import GroupWorkspace from './group-workspace'

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params
  return <GroupWorkspace groupId={groupId} />
}
