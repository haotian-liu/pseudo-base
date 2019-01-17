window.onload = function() {
  let map = new BMap.Map("map");
  let point = new BMap.Point(116.404, 39.915);
  const inital_Oa = 11;
  map.centerAndZoom(point, inital_Oa);
  map.enableScrollWheelZoom();
  d3.select("#container").style("display", "none");

  let heatmap_config = {
    "radius": 20,
    "opacity": 0.3,
    // "gradient": {
    //   .0:'rgb(0, 0, 255)',
    //   .5:'rgb(0, 110, 255)',
    //   .8:'rgb(100, 0, 255)'
    // }
  };
  window.heatmapOverlays = new Array();
  let start_Oa = 11, end_Oa = 18;
  for (let i=0; i<=(end_Oa - start_Oa); i++) {
    let new_rad = parseInt(Math.pow(1.5, i) * heatmap_config.radius);
    let new_config = {...heatmap_config, radius: new_rad};
    let heatmapOverlay = new BMapLib.HeatmapOverlay(new_config);
    heatmapOverlays.push(heatmapOverlay);
    map.addOverlay(heatmapOverlay);
    heatmapOverlay.hide();
  }
  heatmapOverlays[0].show();

  d3.json("./data/clustered.json").then(function(data) {
    d3.select("#container").style("display", "block");
    d3.select("#loading").style("display", "none");
    window.visualizer = new DataVisualizer(data, {
      start_Oa: start_Oa,
      end_Oa: end_Oa
    });
    map.addEventListener("zoomend", visualizer.zoom_map_overlay.bind(visualizer));
  });
}

function draw_heat_map(index, points) {
  const max_val = 100;
  if (points !== null && max_val !== null) { window.last_datapoints = points; }

  heatmapOverlays[index].setDataSet({
    data: last_datapoints,
    max: max_val * Math.pow(0.5, index)
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function coord_transform(lon, lat) {
  coord = coordtransform.wgs84togcj02(lon, lat);
  return coordtransform.gcj02tobd09(coord[0], coord[1]);
}

function DataVisualizer(data, configuration) {
  this.data = data;
  this.configuration = configuration;
  this.current_overlay_index = 0;
  this.data_select = {
    range: "all",
    tag: "all"
  }
  this.last_event = {};

  this.text_start_animate = "Animate";
  this.text_cancel_animate = "Cancel";

  this.data.forEach(e => {
    e.total = e.data.reduce((accu, elem) => accu + elem.count, 0);
    e.timestamp = new Date(e.span);
  });

  // invoke other initialize methods
  this.initialize_chart();
  this.update_data();
  this.load_chart();
  this.toggle_on_change_events();
}

DataVisualizer.prototype.initialize_chart = function() {
  const chart_bbox = d3.select("#charts").node().getBoundingClientRect();
  const svg_height = 280;
  this.margin = {top:10, right: 20, bottom: 70, left: 50}
  this.margin_zoom = {top: 230, right: 20, bottom: 20, left: 50}
  this.width = chart_bbox.width - this.margin.left - this.margin.right;
  this.height = svg_height - this.margin.top - this.margin.bottom;
  this.height_zoom = svg_height - this.margin_zoom.top - this.margin_zoom.bottom;
  this.d3_chart_svg = d3.select("#charts").append("svg")
    .attr("width", chart_bbox.width)
    .attr("height", svg_height)
  this.visualize_position = parseInt(this.width / 2);

  let x = d3.scaleTime().range([0, this.width]);
  let y = d3.scaleLinear().range([this.height, 0]);
  let x_zoom = d3.scaleTime().range([0, this.width]);
  let y_zoom = d3.scaleLinear().range([this.height_zoom, 0]);

  this.x = x;
  this.y = y;
  this.x_zoom = x_zoom;
  this.y_zoom = y_zoom;

  this.xAxis = d3.axisBottom(x);
  this.xAxis_zoom = d3.axisBottom(x_zoom);
  this.yAxis = d3.axisLeft(y);

  // define the area
  this.area = d3.area()
    .curve(d3.curveMonotoneX)
    .x(function(e) { return x(e.timestamp); })
    .y0(this.height)
    .y1(function(e) { return y(e.total); });

  // define the value line
  this.valueline = d3.line()
    .curve(d3.curveMonotoneX)
    .x(function(e) { return x(e.timestamp); })
    .y(function(e) { return y(e.total); });

  // define the zoom line
  this.zoomline = d3.line()
    .curve(d3.curveMonotoneX)
    .x(function(e) { return x_zoom(e.timestamp); })
    .y(function(e) { return y_zoom(e.total); });

  this.brush = d3.brushX()
    .extent([[0, 0], [this.width, this.height_zoom]])
    .on("brush end", this.brushed.bind(null, this));

  this.zoom = d3.zoom()
    .scaleExtent([1, Infinity])
    .translateExtent([[0, 0], [this.width, this.height]])
    .extent([[0, 0], [this.width, this.height]])
    .on("zoom", this.zoomed.bind(null, this));

  this.clip = this.d3_chart_svg.append("defs").append("svg:clipPath")
    .attr("id", "clip")
    .append("svg:rect")
    .attr("width", this.width)
    .attr("height", this.height)
    .attr("x", 0)
    .attr("y", 0);

  this.Line_chart = this.d3_chart_svg.append("g")
    .attr("class", "focus")
    .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")")
    .attr("clip-path", "url(#clip)");

  this.focus = this.d3_chart_svg.append("g")
    .attr("class", "focus")
    .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");

  this.context = this.d3_chart_svg.append("g")
    .attr("class", "context")
    .attr("transform", "translate(" + this.margin_zoom.left + "," + this.margin_zoom.top + ")");
}

DataVisualizer.prototype.load_chart = function() {
  let display = this.data_display;

  const color = d3.scaleOrdinal(d3.schemeCategory10);

  this.x.domain(d3.extent(display, function(e) { return e.timestamp; }));
  this.y.domain(d3.extent(display, function(e) { return e.total; }));
  this.x_zoom.domain(this.x.domain());
  this.y_zoom.domain(this.y.domain());

  // add the area
  this.Line_chart.append("path")
    .datum(display)
    .attr("class", "area")
    .attr("d", this.area);

  this.Line_chart.append("path")
    .datum(display)
    .attr("class", "line")
    .style("stroke", function() { return color("curveMonotoneX"); })
    .attr("d", this.valueline);

  this.context.append("path")
    .datum(display)
    .attr("class", "line")
    .style("stroke", function() { return color("curveMonotoneX"); })
    .attr("d", this.zoomline);

  this.context.append("g")
    .attr("class", "axis axis--x")
    .attr("transform", "translate(0," + this.height_zoom + ")")
    .call(this.xAxis_zoom);

  this.context.append("g")
    .attr("class", "brush")
    .call(this.brush)
    .call(this.brush.move, this.x.range());

  this.d3_chart_svg.append("rect")
    .attr("class", "zoom")
    .attr("width", this.width)
    .attr("height", this.height)
    .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")")
    .call(this.zoom);

  this.focus.append("g")
    .attr("class", "axis axis--x")
    .attr("transform", "translate(0," + this.height + ")")
    .call(this.xAxis);

  this.focus.append("g")
    .attr("class", "axis axis--y")
    .call(this.yAxis);

  this.focus.append("line")
    .attr("id", "visualize_position_line")
    .attr("x1", 0)
    .attr("x2", 0)
    .attr("y1", _ => this.height)
    .attr("y2", _ => 0)
    .attr("stroke-width", 1)
    .attr("stroke", "black")
    .attr("transform", `translate(${this.visualize_position}, 0)`);
}

DataVisualizer.prototype.brushed = function(self, redo=false) {
  let s;
  if (!redo) {
    if (d3.event.sourceEvent && d3.event.sourceEvent.type === "zoom") return; // ignore brush-by-zoom
    s = d3.event.selection || self.x_zoom.range();
    self.last_event.method = self.brushed;
    self.last_event.s = s;
  } else {
    s = self.last_event.s;
    if (s === undefined) return;
  }
  self.x.domain(s.map(self.x_zoom.invert, self.x_zoom));
  self.Line_chart.select(".line").attr("d", self.valueline);
  self.Line_chart.select(".area").attr("d", self.area);
  self.focus.select(".axis--x").call(self.xAxis);
  self.d3_chart_svg.select(".zoom").call(self.zoom.transform, d3.zoomIdentity
      .scale(self.width / (s[1] - s[0]))
      .translate(-s[0], 0));

  // update baidu map data
  self.draw_heat_map_single(s.map(self.x_zoom.invert, self.x_zoom)[0]);
}

DataVisualizer.prototype.zoomed = function(self, redo=false) {
  let t;
  if (!redo) {
    if (d3.event.sourceEvent && d3.event.sourceEvent.type === "brush") return; // ignore zoom-by-brush
    t = d3.event.transform;
    self.last_event.method = self.zoomed;
    self.last_event.t = t;
  } else {
    t = self.last_event.t;
    if (t === undefined) return;
  }
  self.x.domain(t.rescaleX(self.x_zoom).domain());
  self.Line_chart.select(".line").attr("d", self.valueline);
  self.Line_chart.select(".area").attr("d", self.area);
  self.focus.select(".axis--x").call(self.xAxis);
  self.context.select(".brush").call(self.brush.move, self.x.range().map(t.invertX, t));

  // update baidu map data
  self.draw_heat_map_single(self.x.invert(self.visualize_position));
}

DataVisualizer.prototype.draw_heat_map_single = function(timestamp) {
  let index = binarySearch(this.data_display, timestamp, 0, this.data_display.length-1, e => e.timestamp);
  let info = this.data_display[index];
  info.data.forEach(e => {
    if (e.coord_transformed === true) { return; }
    let coord = coord_transform(e.lng, e.lat);
    e.lng = coord[0];
    e.lat = coord[1];
    e.coord_transformed = true;
  });
  draw_heat_map(this.current_overlay_index, info.data);
}

DataVisualizer.prototype.toggle_on_change_events = function() {
  let self = this;
  d3.selectAll("input").on("change", function() {
    self.data_select[this.name] = this.value;
    self.update_data();
    self.update_graph();
  });
  d3.select("#animate_control").on("click", function() {
    const btn = d3.select(this);
    let btn_text = btn.text();
    if (btn_text === self.text_start_animate) {
      btn.text(self.text_cancel_animate);
      self.animated(self.x.domain());
    } else {
      btn.text(self.text_start_animate);
      self.cancel_animation = true;
    }
  });
  d3.select("rect.zoom").on("click", function() {
    self.visualize_position = parseInt(d3.mouse(this)[0]);
    d3.select("#visualize_position_line")
      .attr("transform", `translate(${self.visualize_position}, 0)`);
    self.draw_heat_map_single(self.x.invert(self.visualize_position));
  });
}

DataVisualizer.prototype.update_data = function() {
  let config = this.data_select;
  let display = this.data.filter(e => e.tag === config.tag);
  if (config.range !== "all") {
    let timestamp_cluster;
    if (config.range === "week") timestamp_cluster = (e => moment(e).format("W"));
    if (config.range === "weekday") timestamp_cluster = (e => moment(e).format("dddd"));
    let reduced = display.reduce((accu, elem) => {
      let w = timestamp_cluster(elem.timestamp);
      if (accu[w] === undefined) accu[w] = [];
      accu[w].push(elem);
      return accu;
    }, {});
    display = new Array();
    for (let key in reduced) {
      let arr = reduced[key];
      arr.sort((a, b) => a.span < b.span);
      let min_span = arr[0].span;
      let new_arr = new Array();
      arr.forEach(e => {
        const one_day_ms = 86400000;
        let diff = Math.floor((e.span - min_span) / one_day_ms);
        if (diff === 0) {
          // manual `deep copy`
          new_arr.push({...e, data: e.data.slice(0)});
        }
        else {
          let index = binarySearch(new_arr, e.span - diff * one_day_ms, 0, new_arr.length-1, e => e.span);
          new_arr[index].data.push(...e.data);
        }
      });
      display.push(...new_arr);
    }
  }
  display.forEach(e => {
    e.total = e.data.reduce((accu, elem) => accu + elem.count, 0);
  });
  this.data_display = display;
}

DataVisualizer.prototype.update_graph = function() {
  this.x.domain(d3.extent(this.data_display, function(e) { return e.timestamp; }));
  this.x_zoom.domain(this.x.domain());
  this.xAxis = d3.axisBottom(this.x);
  this.xAxis_zoom = d3.axisBottom(this.x_zoom);
  this.focus.select(".axis--x").call(this.xAxis);

  this.y.domain(d3.extent(this.data_display, function(e) { return e.total; }));
  this.y_zoom.domain(this.y.domain());
  this.yAxis = d3.axisLeft(this.y);
  this.focus.select(".axis--y").call(this.yAxis);

  this.Line_chart.select(".line").datum(this.data_display);
  this.Line_chart.select(".line").attr("d", this.valueline);

  this.Line_chart.select(".area").datum(this.data_display);
  this.Line_chart.select(".area").attr("d", this.area);

  this.context.select(".line").datum(this.data_display);
  this.context.select(".line").attr("d", this.zoomline);

  this.last_event.method(this, true);
}

DataVisualizer.prototype.animated = async function(timestamps) {
  let left = binarySearch(this.data_display, timestamps[0], 0, this.data_display.length-1, e => e.timestamp);
  let right = binarySearch(this.data_display, timestamps[1], 0, this.data_display.length-1, e => e.timestamp);
  for (let i=left; i<=right; i++) {
    if (this.cancel_animation) { this.cancel_animation = false; return; }
    this.visualize_position = parseInt((i-left) * this.width / (right - left));
    d3.select("#visualize_position_line")
      .attr("transform", `translate(${this.visualize_position}, 0)`);
    draw_heat_map(this.current_overlay_index, this.data_display[i].data);
    await sleep(100);
  }
  d3.select("#animate_control").text(this.text_start_animate);
}

DataVisualizer.prototype.zoom_map_overlay = function(e) {
  let oa = e.target.Oa;
  let start_Oa = this.configuration.start_Oa, end_Oa = this.configuration.end_Oa;
  if (oa < start_Oa) oa = start_Oa;
  else if (oa > end_Oa) oa = end_Oa;
  heatmapOverlays[this.current_overlay_index].hide();
  this.current_overlay_index = oa - start_Oa;
  heatmapOverlays[this.current_overlay_index].show();
  draw_heat_map(this.current_overlay_index, null, null);
}

const binarySearch = (d, t, s, e, l) => {
  const m = Math.floor((s + e)/2);
  if (t == l(d[m])) return m;
  if (e - 1 === s) return Math.abs(l(d[s]) - t) > Math.abs(l(d[e]) - t) ? e : s;
  if (t > l(d[m])) return binarySearch(d,t,m,e,l);
  if (t < l(d[m])) return binarySearch(d,t,s,m,l);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
