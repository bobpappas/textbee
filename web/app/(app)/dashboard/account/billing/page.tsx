import SubscriptionInfo from '../../(components)/billing/subscription-info'

// Compatibility route for the self-hosted operational SMS policy.
export default function BillingPage() {
  return (
    <div className='max-w-2xl'>
      <SubscriptionInfo />
    </div>
  )
}
