const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  const url = 'https://liguemagnus.com/rencontre/69067/';
  console.log(`Loading ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForTimeout(2000);

  const debug = await page.evaluate(() => {
    const results = {
      dataAttributes: [],
      scriptContent: null,
      bodyTextSample: null
    };

    // Check for data attributes
    const dataElements = document.querySelectorAll('[data-rencontre], [\\:data], [data]');
    console.log('Found', dataElements.length, 'elements with data attributes');

    for (let i = 0; i < Math.min(dataElements.length, 10); i++) {
      const elem = dataElements[i];
      const attrs = [];
      for (const attr of elem.attributes) {
        if (attr.name.includes('data')) {
          attrs.push({
            name: attr.name,
            valueLength: attr.value.length,
            valueSample: attr.value.substring(0, 200)
          });
        }
      }
      if (attrs.length > 0) {
        results.dataAttributes.push({
          tagName: elem.tagName,
          attributes: attrs
        });
      }
    }

    // Check script tags for JSON
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      if (script.textContent.includes('evenements')) {
        results.scriptContent = script.textContent.substring(0, 2000);
        break;
      }
    }

    // Get body text sample
    results.bodyTextSample = document.body.innerText.substring(0, 500);

    return results;
  });

  console.log('\n=== DEBUG RESULTS ===\n');
  console.log('Data attributes found:', debug.dataAttributes.length);
  console.log(JSON.stringify(debug.dataAttributes, null, 2));

  console.log('\n=== Script content (first 2000 chars) ===');
  console.log(debug.scriptContent ? debug.scriptContent.substring(0, 1000) : 'NOT FOUND');

  console.log('\n=== Body text sample ===');
  console.log(debug.bodyTextSample);

  await browser.close();
})();
