const https = require('https');
const fs = require('fs');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function scrape() {
  const html = await fetch('https://omnidim.io');
  const jsMatches = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
  
  let allJs = html;
  for (const jsPath of jsMatches) {
    const url = jsPath.startsWith('http') ? jsPath : `https://omnidim.io${jsPath}`;
    console.log("Fetching", url);
    const js = await fetch(url);
    allJs += js;
  }
  
  // Look for SVG paths containing Capgemini, exotel, Cipla etc or just viewBoxes
  const svgs = allJs.match(/<svg[^>]*>.*?<\/svg>/g) || [];
  console.log(`Found ${svgs.length} literal SVGs in JS/HTML`);
  
  // NextJS often compiles SVGs into React components like React.createElement("svg", ...)
  // This is too hard to parse. Let's look for recognizable paths.
  // Capgemini often has distinctive paths. Let's look for "Capgemini" text
  const excerpt = allJs.substring(Math.max(0, allJs.indexOf("Capgemini") - 100), allJs.indexOf("Capgemini") + 500);
  console.log("Context around Capgemini:", excerpt.length ? excerpt : "Not found");
}

scrape();
