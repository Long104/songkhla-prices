export async function fetchRenderedHtml(url: string): Promise<string | null> {
  const apiKey = process.env.BROWSERLESS_API_KEY;
  if (!apiKey) {
    console.warn("BROWSERLESS_API_KEY is missing.");
    return null;
  }

  try {
    const response = await fetch(`https://chrome.browserless.io/content?token=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
      }),
    });

    if (!response.ok) {
      console.warn(`Browserless fetch failed for ${url}: ${response.statusText}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.error(`Browserless fetch error for ${url}:`, error);
    return null;
  }
}
