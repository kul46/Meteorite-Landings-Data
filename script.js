// Globals & margins
const margin = {top: 60, right: 30, bottom: 60, left: 70};
let width, height;

const svg = d3.select('#svg');
const g = svg.append('g');
const tooltip = d3.select('#tooltip');

let data, topo, sceneIndex = 0;
const titles = [
  '1 Meteorite Falls per Decade',
  '2 Heaviest Meteorites Over Time',
  '3 Global Distribution by Mass',
  '4 Explore Meteorites Freely'
];

// load data + topojson
Promise.all([
  d3.csv('Meteorite_Landings.csv', d => ({
    name: d.name,
    mass: +d['mass (g)'],
    year: d.year ? new Date(d.year).getFullYear() : null,
    lat: +d.reclat,
    lon: +d.reclong,
    recclass: d.recclass
  })).then(raw => raw.filter(d => d.year && d.mass)),
  d3.json('https://unpkg.com/world-atlas@2/countries-50m.json')
]).then(([raw, world]) => {
  data = raw;
  topo = topojson.feature(world, world.objects.countries);
  initControls();
  resize();
  drawScene();
});

// build Prev/Next + explore controls
function initControls() {
  d3.select('#next').on('click', () => { sceneIndex = Math.min(sceneIndex+1, titles.length-1); drawScene(); });
  d3.select('#prev').on('click', () => { sceneIndex = Math.max(sceneIndex-1, 0); drawScene(); });
  // classes dropdown
  const classes = Array.from(new Set(data.map(d=>d.recclass))).sort();
  const sel = d3.select('#classSelect');
  classes.forEach(c => sel.append('option').text(c));
  // slider display
  d3.select('#yearSlider').on('input', function(){
    d3.select('#yr-val').text(this.value);
    if(sceneIndex === 3) drawScene();
  });
  // recalc on window resize
  window.addEventListener('resize', () => {
    resize();
    drawScene();
  });
}

// recalc svg dims
function resize() {
  const bbox = d3.select('#vis').node().getBoundingClientRect();
  width = bbox.width - margin.left - margin.right;
  height = bbox.height - margin.top - margin.bottom;
  svg.attr('width', bbox.width).attr('height', bbox.height);
  g.attr('transform', `translate(${margin.left},${margin.top})`);
}

// main dispatcher
function drawScene() {
  // clear
  g.selectAll('*').remove();
  tooltip.style('opacity',0);
  // Title + pane toggles
  d3.select('#scene-title').text(titles[sceneIndex]);
  d3.select('#explore-panel').style('display', sceneIndex===3 ? 'flex' : 'none');
  // call appropriate:
  [scene1,scene2,scene3,scene4][sceneIndex]();
}

// 1: bar chart per decade
function scene1() {
  const byDec = d3.rollup(data, v=>v.length, d=>Math.floor(d.year/10)*10);
  const decades = Array.from(byDec.keys()).sort((a,b)=>a-b);
  const x = d3.scaleBand().domain(decades).range([0, width]).padding(0.2);
  const y = d3.scaleLinear().domain([0, d3.max(byDec.values())]).nice().range([height,0]);

  g.append('g').attr('class','axis')
    .attr('transform',`translate(0,${height})`)
    .call(d3.axisBottom(x).tickFormat(d=>d))
    .selectAll("text")
      .attr("transform","rotate(-45)")
      .style("text-anchor","end");

  g.append('g').attr('class','axis')
    .call(d3.axisLeft(y));

  g.selectAll('rect').data(decades).enter()
    .append('rect')
      .attr('x', d=>x(d))
      .attr('y', d=>y(byDec.get(d)))
      .attr('width', x.bandwidth())
      .attr('height', d=>height - y(byDec.get(d)))
      .attr('fill','#555');
}

// 2: scatter, log mass + top-10 annotation + tooltip
function scene2() {
  const x = d3.scaleLinear().domain(d3.extent(data,d=>d.year)).nice().range([0,width]);
  const y = d3.scaleLog().domain([1,d3.max(data,d=>d.mass)]).nice().range([height,0]);

  g.append('g').attr('class','axis')
    .attr('transform',`translate(0,${height})`)
    .call(d3.axisBottom(x).tickFormat(d3.format('d')));

  g.append('g').attr('class','axis')
    .call(d3.axisLeft(y).ticks(6,'~s'));

  // all points
  g.append('g').selectAll('circle')
    .data(data).enter()
    .append('circle')
      .attr('cx',d=>x(d.year)).attr('cy',d=>y(d.mass)).attr('r',2).attr('fill','#777')
      .on('mouseover', showTip).on('mouseout', hideTip);

  // highlight top 10
  const top10 = [...data].sort((a,b)=>b.mass-a.mass).slice(0,10);
  g.append('g').selectAll('circle.top')
    .data(top10).enter()
    .append('circle')
      .attr('class','top')
      .attr('cx',d=>x(d.year)).attr('cy',d=>y(d.mass)).attr('r',6).attr('fill','#ff0');

  // annotation on #1
  const t = top10[0];
  const ann = [{ note:{label:`${t.name} (${d3.format(',')(t.mass)} g)`}, x:x(t.year), y:y(t.mass), dx:40, dy:-40 }];
  g.append('g').call(d3.annotation().annotations(ann));
}

// 3: world map + circles + tooltip + annotation
function scene3() {
  const proj = d3.geoMercator().scale((width/640)*100).translate([width/2,height/2]);
  const path = d3.geoPath(proj);

  g.append('g').selectAll('path')
    .data(topo.features).enter()
    .append('path')
      .attr('d', path).attr('fill','#111').attr('stroke','#333');

  const pts = data.filter(d=>d.lat&&d.lon);
  const r = d3.scaleSqrt().domain([0,d3.max(pts,d=>d.mass)]).range([0,12]);

  g.append('g').selectAll('circle')
    .data(pts).enter()
    .append('circle')
      .attr('cx',d=>proj([d.lon,d.lat])[0])
      .attr('cy',d=>proj([d.lon,d.lat])[1])
      .attr('r',d=>r(d.mass))
      .attr('fill','rgba(255,255,255,0.6)')
      .on('mouseover', showTip).on('mouseout', hideTip);

  // annotation on heaviest
  const big = pts.sort((a,b)=>b.mass-a.mass)[0];
  const [ax, ay] = proj([big.lon,big.lat]);
  const ann = [{ note:{label:`Heaviest: ${big.name}`}, x:ax,y:ay, dx:30, dy:30 }];
  g.append('g').call(d3.annotation().annotations(ann));
}

// 4: filtered scatter + tooltip
function scene4() {
  const yr = +d3.select('#yearSlider').property('value');
  const cls = d3.select('#classSelect').property('value');
  let pts = data.filter(d=>d.year>=yr);
  if(cls!=='All') pts = pts.filter(d=>d.recclass===cls);

  const x = d3.scaleLinear().domain(d3.extent(data,d=>d.year)).nice().range([0,width]);
  const y = d3.scaleLog().domain([1,d3.max(data,d=>d.mass)]).nice().range([height,0]);

  g.append('g').attr('class','axis')
    .attr('transform',`translate(0,${height})`)
    .call(d3.axisBottom(x).tickFormat(d3.format('d')));

  g.append('g').attr('class','axis')
    .call(d3.axisLeft(y).ticks(6,'~s'));

  g.append('g').selectAll('circle')
    .data(pts).join('circle')
      .attr('cx',d=>x(d.year)).attr('cy',d=>y(d.mass)).attr('r',3).attr('fill','#0af')
      .on('mouseover', showTip).on('mouseout', hideTip);
}

// tooltip helpers with edge-clamping
function showTip(event,d) {
  const [mx,my] = d3.pointer(event);
  const txt = `<strong>${d.name}</strong><br/>Year: ${d.year}<br/>Mass: ${d3.format(',')(d.mass)} g`;
  tooltip.html(txt).style('opacity',1);

  let x = event.pageX + 10;
  let y = event.pageY + 10;
  const tt = tooltip.node().getBoundingClientRect();
  if(x + tt.width > window.innerWidth)  x = window.innerWidth - tt.width - 10;
  if(y + tt.height > window.innerHeight) y = window.innerHeight - tt.height - 10;

  tooltip.style('left',x+'px').style('top',y+'px');
}
function hideTip() { tooltip.style('opacity',0); }
