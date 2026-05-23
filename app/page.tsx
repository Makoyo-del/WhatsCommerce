export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>✅ WhatsCommerce is running</h1>
      <p>This server handles WhatsApp webhooks. There is no frontend UI — everything happens inside WhatsApp.</p>
      <h2>Endpoints</h2>
      <ul>
        <li><code>/api/webhook</code> — WhatsApp Cloud API webhook</li>
        <li><code>/api/paystack-webhook</code> — Paystack payment webhook</li>
      </ul>
    </main>
  );
}
