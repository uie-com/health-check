export default async (request: Request) => {
    const { siteName, retryInMs = 30_000 } = await request.json();

    // wait until it's time to retry
    await new Promise((r) => setTimeout(r, retryInMs));

    // call your Next.js route (use a full absolute URL)
    await fetch(`${process.env.URL}/check?site=${encodeURIComponent(siteName)}`, {
        method: 'GET',
        headers: { 'x-internal-secret': process.env.INTERNAL_SECRET || '' },
    });

    // Background functions return 202 immediately; no explicit response body needed
};