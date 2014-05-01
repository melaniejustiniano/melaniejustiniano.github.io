/*****************************************************************************
 * GLOBALS
 *****************************************************************************/

var data = {};

// Visualizations
var p = {}, // primary visualization
    s = {}, // slider visualization
    g = {}, // genre detail visualization
    c = {}; // city detail visualization

// Controls
var controls = {};

// Globals
var updateDuration = 1000,
    updateTransition;

var zoomRadius = 4;


/*****************************************************************************
 * DATA LOADERS
 *****************************************************************************/

// Map data loader
function loadStates(callback) {
    d3.json("data/us-named.json", function(error, loadedData) {
        data.usMap = topojson.feature(loadedData, loadedData.objects.states).features
        callback();
    });
};

// Genre data loader
function loadGenres(callback) {
    d3.json("data/artistsByGenre.json", function(error, loadedData) {
        data.genres = [];

        loadedData.forEach(function(d) {
            var genre = { genre: d.name, locations: d.locations, years: [], yearRange: [], artistCountRange: [], topCities: [], totalArtists: 0 }, 
                years = {};

            // TODO: sorted by year already? expedite this? // duplicate data
            genre.locations.forEach(function(location) {
                var start = location.artists[0].years_active[0].start;
                location.artists.forEach(function(artist) {
                    var year = artist.years_active[0].start;
                    if (years[year])
                        years[year].push(artist);
                    else 
                        years[year] = [artist];

                    if (year < start) start = year;
                });

                location.start = start;
                genre.totalArtists += location.artists.length;
                genre.topCities.push(location);

                // TODO: map names - done on data processing end - is data specific though so update? not automated
                location.abbrev = location.details.address_components[0].short_name;
                /*switch (toUpperCase(location.abbrev)) {
                    case "LOS ANGELES":
                        location.abbrev = "L.A.";
                        break;
                    case "SF":
                        location.abbrev = "S.F.";
                        break;
                    case "NEW YORK":
                        location.abbrev = "N.Y.C.";
                        break;
                }*/
            });
            for (var year in years)
                genre.years.push({ year: +year, artists: years[year] })

            // precompute ranges for domains
            genre.yearRange = d3.extent(genre.years, function(y) {
                return y.year
            });
            genre.artistCountRange = [0, d3.max(genre.years, function(y) {
                return y.artists.length;
            })];

            // precomupute most popular
            genre.topCities.sort(function(a, b) {
                if (a.artists.length < b.artists.length) return 1;
                else if (a.artists.length > b.artists.length) return -1;
                else return 0;
            });
            genre.topCities = genre.topCities.slice(0, 5);

            // add 0 data for no artists - if wasn't in years, add to genre.years - kind of confusing
            for (var y = genre.yearRange[0]; y <= genre.yearRange[1]; y++) {
                if (!years[y]) genre.years.push({ year: y, artists: [] });
            }

            genre.years.sort(function(a, b) {
                if (a.year < b.year) return -1;
                else if (a.year > b.year) return 1;
                else return 0;
            });
            data.genres.push(genre);
        });

        callback();
    });
}

// Helper for resorting data
function sortGenres() {
    data.genres.sort(function(a, b) {
        if (a.genre > b.genre) return 1;
        else if (a.genre < b.genre) return -1;
        else return 0;
    });
}

function locationCompare(a, b) {
    if (a.start < b.start) return -1;
    else if (a.start > b.start) return 1;
    else return 0;
}

/*****************************************************************************
 * VISUALIZATION INITIALIZERS
 *****************************************************************************/

// Helper function (standard initialization)
function initVis(vis, id, width, height, mTop, mRight, mBottom, mLeft) {
    vis.margin = { top: mTop, right: mRight, bottom: mBottom, left: mLeft };

    vis.width = width - vis.margin.left - vis.margin.right;
    vis.height = height - vis.margin.bottom - vis.margin.top;

    vis.svg = d3.select(id).append("svg").attr({
        width: vis.width + vis.margin.left + vis.margin.right,
        height: vis.height + vis.margin.top + vis.margin.bottom
    })

    vis.vis = vis.svg.append("g").attr({
        transform: "translate(" + vis.margin.left + "," + vis.margin.top + ")"
    });
}

// Primary visualization initializer
function initPrimary() {
    initVis(p, "#vis", 700, 440, 15, 50, 5, 10);

    // Create map
    p.projection = d3.geo.albersUsa().translate([p.width / 2, p.height / 2]).scale(900);
    p.path = d3.geo.path().projection(p.projection);
    p.centered;

    p.vis.attr("class", "country");
    p.vis.selectAll(".state")
            .data(data.usMap)
        .enter().append("path")
            .attr("d", p.path)
            .attr("class", "state")
            .on("click", updatePrimaryZoom);


    p.colorScale = d3.scale.linear()
        .range(["#2F0f71", "#956BD6"]);
}

// Slider initializer
function initSlider() {
    initVis(s, "#slider", 900, 176, 30, 0, 20, 30);

    s.inner = {};
    s.inner.margin = { top: 50 - s.margin.top, right: 0, bottom: 80 - s.margin.bottom, left: 0 };
    s.inner.width = s.width - s.inner.margin.left - s.inner.margin.right;
    s.inner.height = s.height - s.inner.margin.bottom - s.inner.margin.top;

    // Inner visualization
    s.inner.vis = s.vis.append("g").attr({
        transform: "translate(" + s.inner.margin.left + "," + s.inner.margin.top + ")"
    }).attr("class", "inner-vis");

    s.inner.vis.append("g").attr("class", "x axis");

    s.inner.vis.append("path").attr("class", "line");

    // Inner visualization overlay
    s.inner.overlay = s.vis.append("g").attr({
        transform: "translate(" + s.inner.margin.left + "," + s.inner.margin.top + ")"
    }).attr("class", "inner-vis overlay");

    s.inner.overlay.append("g").attr("class", "x axis");

    s.inner.overlay.append("path").attr("class", "line");

    // mask both to avoid duplicate and consequences on anti-aliasing
    s.inner.clipPathRect = s.vis.append("clipPath") //Make a new clipPath
            .attr("id", "inner-vis-clip-path")  //Assign an ID
        .append("rect")                     //Within the clipPath, create a new rect
            .attr("x", 0)                 //Set rect's position and size…
            .attr("y", -s.inner.margin.top)
            .attr("width", s.width)
            .attr("height", s.height);
    s.inner.vis.attr("clip-path", "url(#inner-vis-clip-path)");

    // mask both to avoid duplicate and consequences on anti-aliasing
    s.inner.overlayClipPathRect = s.vis.append("clipPath") //Make a new clipPath
            .attr("id", "inner-vis-overlay-clip-path")           //Assign an ID
        .append("rect")                     //Within the clipPath, create a new rect
            .attr("x", 0)                 //Set rect's position and size…
            .attr("y", -s.inner.margin.top)
            .attr("width", 0)
            .attr("height", s.height);
    s.inner.overlay.attr("clip-path", "url(#inner-vis-overlay-clip-path)") ;

    s.slide = s.vis.append("g")
        .attr("class", "brush");

    s.handle = s.slide.append("g")
        .attr("class", "handle")
        .attr("transform", "translate(0,0)");

    s.handleBar = s.handle.append("line")
        .attr("class", "handle-bar")
        .attr({ x1: 0, y1: 0, x2: 0, y2: (s.height - 20) });

    s.handleLabel = s.handle.append("text")
        .attr("class", "handle-label")
        .attr("transform", "translate(0," + (s.height - 10) + ")");
}

// Genre detail visualization initializer
function initGenreDetail() {
    initVis(g, "#genre-detail", 300, 220, 20, 20, 20, 20);

    g.detailPanel = d3.select("#genre-detail");
    g.name = g.detailPanel.select(".name");
    g.artistCount = g.detailPanel.select(".artist-count .count");

    var max = d3.max(data.genres, function(genre) {
        return genre.topCities[0].artists.length;
    });
    g.yScale = d3.scale.linear()
        .range([0, g.height])
        .domain([0, max]);
}

// City detail table initializer
function initCityDetail() {
    c.detailPanel = d3.select("#city-detail");
    c.name = c.detailPanel.select(".name");
    c.artistCount = c.detailPanel.select(".artist-count.total .count");
    c.currentAristCount = c.detailPanel.select(".artist-count.current .count");
    c.currentAristCountYear = c.detailPanel.select(".artist-count.current .year");
    c.artistsTable = c.detailPanel.select(".artists");
}

/*****************************************************************************
 * ACCESSORY INITIALIZERS
 *****************************************************************************/

// Create dropdown menu
function initGenreMenu(d) {    
    // dropdown list
    controls.genreSelect = d3.select(".genre-select");
    controls.genreSelected = controls.genreSelect.select(".selected")
        .text(d.genre);
    controls.dropdown = controls.genreSelect.select(".dropdown");

    controls.dropdownDataSet = data.genres.filter(function(e) { return d != e; });
    controls.hoveredIndex = 0; // only used for 

    controls.dropdownItems = controls.dropdown.selectAll("li")
            .data(controls.dropdownDataSet)
        .enter().append("li")
            .text(function(d) { return d.genre; })
            .on("mouseover", function(d, i) {
                controls.hoveredIndex = i;

                // update this and others
                controls.dropdownItems.classed("hover", function(e, j) {
                    return j == controls.hoveredIndex;
                });
            })
            .on("click", function(d) {
                d3.event.stopPropagation();
            
                updateGenre(d);
            });

    controls.genreSelect.on("click", function() {
        d3.event.stopPropagation();
        d3.select(this).classed('active', !d3.select(this).classed('active'));

        controls.dropdownItems.classed("hover", function(e, j) {
            return j == controls.hoveredIndex;
        });
    });

    // TODO - Move outside - use prevent default on all non things
    d3.select("body").on("click", function() {
        controls.genreSelect.classed('active', false);
    });
}

// Initialize Controls
function initKeyboardControls() {
    var KEY = { SPACE: 32, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13 };

    d3.select("body").on("keydown", function() {
        d3.event.preventDefault();

        var min = s.brush.x().domain()[0],
            max = s.brush.x().domain()[1],
            val = s.brush.extent()[0];

        switch (d3.event.keyCode) {
            case KEY.LEFT:
                if (--val >= min && !controls.playing) updateYear(val);
                break;
            case KEY.RIGHT:
                if (++val <= max && !controls.playing) updateYear(val);
                break;
            case KEY.UP:
                if (!controls.genreSelect.classed('active'))
                    controls.genreSelect.classed('active', true);
                else if (controls.hoveredIndex > 0) 
                    --controls.hoveredIndex;
                controls.dropdownItems.classed("hover", function(d, i) {
                    return i == controls.hoveredIndex;
                });
                break;
            case KEY.DOWN:
                if (!controls.genreSelect.classed('active'))
                    controls.genreSelect.classed('active', true);
                else if (controls.hoveredIndex < controls.dropdownDataSet.length - 1)
                    ++controls.hoveredIndex;
                controls.dropdownItems.classed("hover", function(d, i) {
                    return i == controls.hoveredIndex;
                });                
                break;
            case KEY.SPACE:
                play();
                break;
            case KEY.ENTER:
                if (controls.genreSelect.classed('active'))
                    updateGenre(controls.dropdownDataSet[controls.hoveredIndex]);
                break;
        }
    });
}

// Initialize transport controls - http://bl.ocks.org/rgdonohue/9280446
function initTransportControls() {
    controls.transport = d3.select("#transport");
    controls.transport.select("#start").on("click", function() {
        updateYear(s.brush.x().domain()[0]);
    });
    controls.transport.select("#end").on("click", function() {
        updateYear(s.brush.x().domain()[1]);
    });
    controls.transport.select("#prev").on("click", function() {
        var min = s.brush.x().domain()[0],
            val = s.brush.extent()[0];
 
        if (--val >= min && !controls.playing) updateYear(val);
    });
    controls.transport.select("#next").on("click", function() {
        var max = s.brush.x().domain()[1],
            val = s.brush.extent()[0];

        if (++val <= max && !controls.playing) updateYear(val);
    });

    controls.timer;  // create timer object
    controls.playing = false;

    d3.select('#play').on('click', play);
}

// Playback animation
function play() {
    var max = s.brush.x().domain()[1],
        min = s.brush.x().domain()[0],
        val = s.brush.extent()[0];

    if (!controls.playing) {  // if the map is currently playing

        if (val >= max) updateYear(min);

        d3.select("#play img").attr("src",'css/transport/pause.png');  // change the button label to stop
        controls.playing = true;   // change the status of the animation

        controls.timer = setInterval(function() {   // set a JS interval
            val = s.brush.extent()[0];
            if (++val <= max) {
                updateYear(val);  // increment the current attribute counter
            }
            else {
                clearInterval(controls.timer);   // stop the animation by clearing the interval
                d3.select("#play img").attr("src", 'css/transport/play.png');   // change the button label to play
                controls.playing = false;   // change the status again
            }
        }, 100);
    } 
    else {    // else if is currently playing
        clearInterval(controls.timer);   // stop the animation by clearing the interval
        d3.select("#play img").attr("src",'css/transport/play.png');   // change the button label to play
        controls.playing = false;   // change the status again
    } 
}

/*****************************************************************************
 * COMPONENT UPDATERS
 *****************************************************************************/

function updatePrimaryGenre(genre) {
    // Create circles on the maps representing artists
    genre.locations.sort(locationCompare);
    p.cities = p.vis.selectAll(".city")
        .data(genre.locations);

    // Fade out all cities
    p.cities.transition()
        .duration(updateDuration / 2)
        .style("opacity", 0);

    // Remove unused circles
    p.cities.exit().remove();

    // Add new circles where necessary
    p.cities.enter().append("svg:circle")
        .attr("class", "city");

    p.colorScale.domain([0, (genre.yearRange[1] - genre.yearRange[0]) / 2]);

    // Update all circles appropriately
    p.cities
        .style("opacity", 0)
        .attr("cx", function (d) { 
            var location = d.details.geometry.location; 
            return p.projection([location.lng, location.lat])[0]})
        .attr("cy", function (d) { 
            var location = d.details.geometry.location; 
            return p.projection([location.lng, location.lat])[1]})
        // place all cities but hide those that aren't in first year
        .classed("hidden", function (d) {
            var first = genre.yearRange[0];
            // if any artist from city started in first year, show city
            var ifFromFirst = d.artists.some(function(artist) {
                var start = artist.years_active[0].start;
                return (start <= first); 
            })

            return !(ifFromFirst);
        })
        .attr("r", function(d) {
            var first = genre.yearRange[0];

            // count artists from area in first year and scale radius
            var count = 0;
            d.artists.forEach( function (artist) {
                var start = artist.years_active[0].start;
                if (start <= first) count++;
            })
            return 7 * Math.sqrt(count);
        })
        .attr("fill", p.colorScale.range()[0])
        .transition()
        .duration(updateDuration / 2)
        .style("opacity", null);

    // On click show detail
    p.cities
        .on("click", function(d) {
            if (c.detailPanel.style("display") == "none" || c.city != d) {
                d3.event.stopPropagation();
                updateCityDetail(d);
                c.detailPanel.style("display", "inherit");
                g.detailPanel.style("display", "none");

                p.cities.classed("selected", false);
                d3.select(this).classed("selected", true);
            }
            else {       
                c.detailPanel.style("display", "none");
                g.detailPanel.style("display", "inherit");
                p.cities.classed("selected", false);
            }
        })
        .on("mouseover", function(d) {

        })
        .on("mouseout", function() {

        });
}

function updatePrimaryYear(year) {
    p.cities
        // show city if any artist originated before current year
        .classed("hidden", function(d) {
            var ifOriginated = d.artists.some(function(artist) {
                var start = artist.years_active[0].start;
                return (start <= year); 
            })

            return !(ifOriginated);  
        })
        // mark cities with no artists from that year as in the past
        .classed("past", function(d) {
            var isCurrentYear = d.artists.some(function(artist) {
                var start = artist.years_active[0].start;
                return (start == year); })

            return !(isCurrentYear)
        });

    p.cities.transition().duration(100)
        // count number of artists in city until that year and scale radius
        .attr("r", function(d) {
            if (p.centered) return zoomRadius;
            else {
                var count = 0,
                    mostRecent = 0;
                d.artists.forEach(function(artist) {
                    var start = artist.years_active[0].start;
                    if (start <= year) count++;
                    if (start > mostRecent) mostRecent = start;
                })
                var multiplier = (mostRecent == year) ? 8 : 7;
                return multiplier * Math.sqrt(count);
            }
        })
        .attr("fill", function(d) {
            // most recent
            var lastUpdate = 0;
            d.artists.forEach( function(artist) {
                var start = artist.years_active[0].start;
                if (start <= year && start > lastUpdate) lastUpdate = start;
            })
            var age = year - lastUpdate;
            return p.colorScale(age);
        })
        .each("end", function(d) {
            if (p.centered) return zoomRadius;
            else {
                d3.select(this).transition().duration(80)
                    .attr("r", function(d) {            
                        var count = 0;
                        d.artists.forEach( function(artist) {
                            var start = artist.years_active[0].start;
                            if (start <= year) count++;
                        })
                        return 7 * Math.sqrt(count);
                    });
            }
        });
}

function updateSliderGenre(genre) {
    // tools
    s.xScale = d3.scale.linear()
        .domain(genre.yearRange)
        .rangeRound([0, s.inner.width])
        .clamp(true);

    s.yScale = d3.scale.linear()
        .domain(genre.artistCountRange)
        .range([s.inner.height, 0]);

    s.xAxis = d3.svg.axis()
        .scale(s.xScale)
        .orient("bottom")
        .tickFormat(d3.format("d"));

    s.line = d3.svg.line()
        .interpolate("cardinal")
        .x( function (d) { return s.xScale(d.year); } )
        .y( function (d) { return s.yScale(d.artists.length); } );   

    s.brush = d3.svg.brush()
        .x(s.xScale)
        .extent([s.xScale.domain()[0], s.xScale.domain()[0]])
        .on("brush", brushed);     

    s.inner.circles = s.inner.vis.selectAll("circle").data(genre.years);
    s.inner.overlayCircles = s.inner.overlay.selectAll("circle").data(genre.years);

    updateTransition.each(function() {
        // move handle
        s.handle.transition()
            .attr("transform", "translate(0,0)");

        s.inner.clipPathRect.transition()
            .attr("width", s.width)
            .attr("x", 0);

        s.inner.overlayClipPathRect.transition()
            .attr("width", 0);

        // fade out date
      /*  handleLabel.transition()
            .style("opacity", 0);

        sliderVis.selectAll(".x.axis .tick").transition()
            .style("opacity", 0);

        // fade out data
        sliderVis.selectAll("circle").transition()
            .style("opacity", 0);

        sliderVis.selectAll(".line").transition()
            .style("opacity", 0);*/
    })
    .each("end", function() {
        // Axis
        s.inner.vis.select(".x.axis")
                .attr("transform", "translate(0," + s.inner.height + ")" )
                .call(s.xAxis);

        // Circles
        s.inner.circles.enter()
            .append("circle");

        s.inner.circles
            .attr("r", 2)
            .attr("cx", function (d) {return s.xScale(d.year)})
            .attr("cy", function (d) { return s.yScale(d.artists.length)});

        s.inner.circles.exit()
            .remove();

        // Line
        s.inner.vis.select(".line")
            .datum(genre.years)
            .attr("d", s.line);

        // InnerVis Overlay
        // Axis
        s.inner.overlay.select(".x.axis")
            .attr("transform", "translate(0," + s.inner.height + ")" )
            .call(s.xAxis);

        // Circles
        s.inner.overlayCircles.enter()
            .append("circle");

        s.inner.overlayCircles
            .attr("r", 2)
            .attr("cx", function (d) {return s.xScale(d.year)})
            .attr("cy", function (d) { return s.yScale(d.artists.length)});

        s.inner.overlayCircles.exit()
            .remove();

        // Line
        s.inner.overlay.select(".line")
            .datum(genre.years)
            .attr("d", s.line);

        s.slide.call(s.brush);
        s.slide.selectAll(".extent,.resize").remove();
        s.slide.select(".background")
            .attr("height", s.height);

        s.handleLabel.text(genre.years[0].year);

        // Ensure 0 opacity new case new element added
        // fade out date
      /*  handleLabel.style("opacity", 0);

        sliderVis.selectAll(".x.axis .tick").style("opacity", 0);

        // fade out data
        sliderVis.selectAll("circle").style("opacity", 0);

        sliderVis.selectAll(".line").style("opacity", 0);       */ 
    });

    updateTransition.transition().each(function() {
        // fade in date
        s.handleLabel.transition()
            .style("opacity", 1);

        s.vis.selectAll(".x.axis .tick").transition()
            .style("opacity", 1);

        // fade in data
        s.vis.selectAll("circle").transition()
            .style("opacity", 1);

        s.vis.selectAll(".line").transition()
            .style("opacity", 1);
    });

    // http://bl.ocks.org/mbostock/6452972
    function brushed() {
        var year = Math.round(s.xScale.invert(d3.mouse(this)[0]));
        updateSliderYear(year);
        updatePrimaryYear(year);
    }
}

function updateSliderYear(year) {
    s.brush.extent([year, year]);

    s.handle.attr("transform", "translate(" + s.xScale(year) + ",0)");
    s.handleLabel.text(year);

    s.inner.clipPathRect
        .attr("width", s.width - s.xScale(year))
        .attr("x", s.xScale(year));

    s.inner.overlayClipPathRect
        .attr("width", s.xScale(year));
}

function updateGenreDetail(genre) {
    g.name.text(genre.genre);
    g.artistCount.text(genre.totalArtists);

    g.cities = g.vis.selectAll(".city")
            .data(genre.topCities);

    var newCities = g.cities.enter().append("g")
        .attr("class", "city");

    newCities.append("rect")
        .attr("class", "bar")
        .attr("y", g.height)
        .attr("height", 0);
    newCities.append("text")
        .attr("class", "label");

    var barWidth = g.width / genre.topCities.length;
    g.cities.attr("transform", function(d, i) { return "translate(" + (i * barWidth) + ",0)"; });

    g.bars = g.cities.selectAll(".bar")
        .attr("width", barWidth)
        .attr("x", 0)
        .on("click", function() {
            d3.event.stopPropagation();

            var dParent = d3.select(this.parentNode)[0][0].__data__;
            updateCityDetail(dParent);
            c.detailPanel.style("display", "inherit");
            g.detailPanel.style("display", "none");

            p.cities.classed("selected", function(e) { return e.key == dParent.key; });
        })
        .on("mouseover", function(d) {
            var dParent = d3.select(this.parentNode)[0][0].__data__;
            p.cities.classed("hover", function(e) { return e.key == dParent.key; });
        })
        .on("mouseout", function() {
            p.cities.classed("hover", false);
        });
        
    g.labels = g.cities.selectAll(".label")
        .text(function(d) {
            var dParent = d3.select(this.parentNode)[0][0].__data__;
            return dParent.details.address_components[0].short_name;
        })
        .attr("x", barWidth / 2)
        .style("font-size", null)
        .attr("y", 0);
    wrap(g.labels, barWidth);

    updateTransition.each(function() {
        g.bars.transition().duration(updateDuration)
            .attr("height", function(d) {
                var dParent = d3.select(this.parentNode)[0][0].__data__;
                return g.yScale(dParent.artists.length);
            })
            .attr("y", function(d) {
                var dParent = d3.select(this.parentNode)[0][0].__data__;
                return g.height - g.yScale(dParent.artists.length); 
            });
        g.labels.transition().duration(updateDuration)
            .attr("transform", function(d) {
                var dParent = d3.select(this.parentNode)[0][0].__data__;
                return "translate(0," + (g.height - g.yScale(dParent.artists.length) - 4) + ")";
            });       
    });
         
}

// TODO close when new genre selected??
function updateCityDetail(city) {
    c.city = city;
    c.name.text(city.key);
    c.artistCount.text(city.artists.length);

    var currentYear = s.brush.extent()[0];
    c.currentAristCount.text(city.artists.filter(function(d) { return d.years_active[0].start < currentYear; }).length);
    c.currentAristCountYear.text(currentYear);

    city.artists.sort(function(a, b) {
        if (a.years_active[0].start < b.years_active[0].start) return -1;
        else if (a.years_active[0].start > b.years_active[0].start) return 1;
        else return 0;
    })

    c.artists = c.artistsTable.selectAll(".artist")
        .data(city.artists, function(d) { return d.name; });

    c.artists.exit()
        .remove();

    c.artistRows = c.artists.enter().append("tr")
        .attr("class", "artist")
        .classed("current", function(d) {
            return d.years_active[0].start <= currentYear;
        });
    c.artistRows.append("td")
        .attr("class", "name")
        .text(function(d) { return d.name; });
    c.artistRows.append("td")
        .attr("class", "year")
        .text(function(d) { return d.years_active[0].start; });
}

function updateCityDetailYear(year) {
    if (c.detailPanel.style("display") != "none") {
        c.currentAristCount.text(c.city.artists.filter(function(d) { return d.years_active[0].start < year; }).length);
        c.currentAristCountYear.text(year);

        c.artistRows
            .classed("current", function(d) {
                return d.years_active[0].start <= year;
            });
    }
}

function updatePrimaryZoom(d) {
    var x, y, scale;

    if (d && p.centered !== d) {
        var centroid = p.path.centroid(d);
        x = centroid[0];
        y = centroid[1];

        var defaultScale = 3,
            widthScale = p.width / this.getBBox().width,
            heightScale = p.height / this.getBBox().height;

        scale = d3.min([defaultScale, widthScale, heightScale]);

        p.centered = d;

        p.cities.transition().duration(500)
            .attr("r", zoomRadius); // fixed city size
    }
    else {
        x = p.width / 2 ;
        y = p.height / 2;
        scale = 1;
        p.centered = null;

        var year = s.brush.extent()[0];
        p.cities.transition().duration(500)
            .attr("r", function(d) {
                // count artists from area in first year and scale radius
                var count = 0;
                d.artists.forEach( function (artist) {
                    var start = artist.years_active[0].start;
                    if (start <= year) count++;
                })
                return 7 * Math.sqrt(count);
            });
    }
 
    p.vis.selectAll("path")
        .classed("active", p.centered && function (d) { 
            return d === p.centered });

    p.vis.transition()
        .duration(500)
        .attr("transform",
            "translate(" + (p.width / 2 + p.margin.left) 
            + "," + (p.height / 2 + p.margin.top)
            + ")scale(" + scale  
            + ")translate(" + -x + "," + -y + ")" )
};

function updateGenreMenu(genre) {
    controls.genreSelected.text(genre.genre);

    controls.dropdownDataSet = data.genres.filter(function(e) { return genre != e; });
    sortGenres();

    controls.dropdown.selectAll("li")
        .data(controls.dropdownDataSet)
        .text(function(d) { return d.genre; });
    controls.genreSelect.classed('active', false);
}


/*****************************************************************************
 * HELPERS
 *****************************************************************************/

// http://bl.ocks.org/mbostock/7555321
function wrap(text, width) {
    text.each(function() {
        var text = d3.select(this),
            words = text.text().split(/\s+/).reverse(),
            word,
            line = [],
            lineNumber = 0,
            lineHeight = 1.1, // ems
            y = text.attr("y"),
            x = text.attr("x"),
            tspan = text.text(null).append("tspan").attr("x", x).attr("y", y);
        while (word = words.pop()) {
            line.push(word);
            tspan.text(line.join(" "));
            if (tspan.node().getComputedTextLength() > width) {
                line.pop();
                tspan.text(line.join(" "));
                line = [word];
                tspan = text.append("tspan").attr("x", x).attr("y", y).attr("dy", ++lineNumber * lineHeight + "em").text(word);
            }
        }
        text.selectAll("tspan")
            .attr("dy", function() {
                var dy = 0;
                if (d3.select(this).attr("dy")) {
                    var dyString = d3.select(this).attr("dy");
                    dy = +dyString.slice(0, dyString.length - 2);
                }
                return (dy - lineNumber * lineHeight) + "em";
            });

        text.selectAll("tspan").each(function() {
            var tspan = d3.select(this),
                tspanWidth = tspan.node().getComputedTextLength();
            do {
                if (tspanWidth > width) {
                    var parent = d3.select(tspan[0][0].parentNode),
                        fontSizeString = parent.style("font-size"),
                        fontSize = fontSizeString.slice(0, fontSizeString.length - 2);

                    parent.style("font-size", (fontSize - 1) + "px");
                    tspanWidth = tspan.node().getComputedTextLength();
                }
            } while (tspanWidth > width);
        });
    });
}


/*****************************************************************************
 * GLOBAL UPDATERS
 *****************************************************************************/

function updateGenre(genre) {
    updateTransition = d3.transition().duration(updateDuration);
    updatePrimaryGenre(genre);
    updateSliderGenre(genre);
    updateGenreDetail(genre);
    updateGenreMenu(genre);
}

function updateYear(year) {
    updatePrimaryYear(year);
    updateSliderYear(year);
    updateCityDetailYear(year);
}

/*****************************************************************************
 * GLOBAL INITIALIZERS
 *****************************************************************************/

function globalCallback(funcs, callback) {
    var counter = funcs.length;

    funcs.map(function(func) {
        func(function() {
            if (--counter == 0)
                callback();
        });
    });
}

function init() {
    globalCallback([loadStates, loadGenres], function() {
        sortGenres();
        var genre = data.genres[0];

        // Primary Visualization
        initPrimary();

        // Slider
        initSlider();

        // Detail Visualization
        initGenreDetail();
        initCityDetail();

        // Menu
        initGenreMenu(genre);

        updateGenre(genre);

        // Controls
        initKeyboardControls();
        initTransportControls();
    });
}

init();