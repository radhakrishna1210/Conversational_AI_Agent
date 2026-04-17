fetch('https://omnidim.io').then(r=>r.text()).then(t => {
  const matches = t.match(/class="[^"]*font-[a-zA-Z0-9-]+[^"]*"/g) || [];
  const links = t.match(/href="[^"]*fonts[^"]*"/g) || [];
  const styles = t.match(/font-family[^;>]+/g) || [];
  console.log("Links:", links);
  console.log("Styles:", styles.slice(0, 5));
}).catch(console.error);
