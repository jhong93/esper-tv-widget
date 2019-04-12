/* Embed a chart using vega-embed */

function fillZeros(data, unit, start, end, default_value) {
  let all_ts = new Set(Object.keys(data));
  Object.keys(data).forEach(t_curr_str => {
    let t_prev = new Date(t_curr_str);
    let t_next = new Date(t_curr_str);
    if (unit == 'day') {
      t_prev.setUTCDate(t_prev.getUTCDate() - 1);
      t_next.setUTCDate(t_next.getUTCDate() + 1);
    } else if (unit == 'week') {
      t_prev.setUTCDate(t_prev.getUTCDate() - 7);
      t_next.setUTCDate(t_next.getUTCDate() + 7);
    } else if (unit == 'month') {
      t_prev.setUTCMonth(t_prev.getUTCMonth() - 1);
      t_next.setUTCMonth(t_next.getUTCMonth() + 1);
    } else if (unit == 'year') {
      t_prev.setUTCMonth(t_prev.getUTCFullYear() - 1);
      t_next.setUTCMonth(t_next.getUTCFullYear() + 1);
    } else {
      throw Error(`Unknown unit: ${unit}`);
    }
    [t_prev, t_next].forEach(t => {
      let t_str = t.toISOString().split('T')[0];
      if (t_str >= start && t_str <= end) {
        if (t_str == t_curr_str) {
          throw Error('Perturbed date cannot equal current date');
        }
        if (!all_ts.has(t_str)) {
          data[t_str] = default_value;
          all_ts.add(t_str);
        }
      }
    });
  });
  return data;
}

const FILTER_REPLACE_REG_EXP = new RegExp('\\s*:\\s*');

function loadChart(div_id, chart_options, search_results, dimensions) {
  let getSeriesName = (color) => {
    let result = search_results[color];
    let query = result.query.replace('[', '').replace(']', '');
    let filters = result.filters ? ' @ ' + result.filters.replace(FILTER_REPLACE_REG_EXP, '=') : '';
    return `${query}${filters}`;
  };
  let getDateFormat = (agg) => {
    if (agg == 'year') {
      return '%Y';
    } else if (agg == 'month') {
      return '%b `%y';
    } else {
      return '%b %d, %Y';
    }
  }

  let unit = chart_options.window > 0 ? 'seconds' : 'mentions';
  let point_data = Object.keys(search_results).flatMap(color => {
    let result = search_results[color];
    let data = fillZeros(
      result.data, chart_options.aggregate, chart_options.start_date,
      chart_options.end_date, []);
    return Object.keys(data).map(
      t => {
        var link_href = null;
        if (data[t].length > 0) {
          link_href = `/videos?query=${result.query}&window=${chart_options.window}&ids=${JSON.stringify(data[t].map(x => x[0]))}`;
        }
        return {
          time: t, color: color, query: getSeriesName(color),
          value: data[t].reduce((acc, x) => acc + x[1], 0),
          video_href: link_href,
          size: data[t].length > 0 ? 30 : 0
        };
      }
    );
  });
  let series = Object.keys(search_results).map(
    color => ({name: getSeriesName(color), color: color})
  );
  let tooltip_data = Array.from(new Set(point_data.map(x => x.time))).map(t => {
    let point = {time: t};
    Object.keys(search_results).forEach(color => {
      let series_name = getSeriesName(color);
      let videos = _.get(search_results[color].data, t, []);
      let value = videos.reduce((acc, x) => acc + x[1], 0);
      point[series_name] = `${value} ${unit} in ${videos.length} videos`;
    });
    return point;
  });

  let vega_spec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v3.json',
    width: dimensions.width,
    height: dimensions.height,
    description: `${chart_options.window  > 0 ? 'Keyword mentions' : 'Topic time'} over time`,
    data: {values: tooltip_data},
    encoding: {
      x: {
        timeUnit: 'utcyearmonthdate', field: 'time', type: 'temporal',
        scale: {
          domain: [chart_options.start_date, chart_options.end_date]
        }
      },
      tooltip: [{
        field: 'time', type: 'temporal', timeUnit: 'utcyearmonthdate',
        title: 'time', format: getDateFormat(chart_options.aggregate)
      }].concat(series.map(x => ({field: x.name, type: 'nominal'}))),
    },
    layer: [{
      data: {values: point_data},
      mark: {
        type: 'line',
        interpolate: 'monotone'
      },
      encoding: {
        x: {
          field: 'time', type: 'temporal', timeUnit: 'utcyearmonthdate',
          scale: {
            domain: [chart_options.start_date, chart_options.end_date]
          }
        },
        y: {field: 'value', type: 'quantitative'},
        color: {field: 'color', type: 'nominal', scale: null},
        size: {value: 2},
        opacity: {value: 0.5}
      }
    }, {
      mark: 'rule',
      selection: {
        hover: {type: 'single', on: 'mouseover', nearest: true}
      },
      encoding: {
        color: {
          condition:{
            selection: {not: 'hover'}, value: 'transparent'
          }
        },
      }
    }, {
      data: {values: point_data},
      mark: {
        type: 'point',
        filled: true
      },
      encoding: {
        x: {
          field: 'time', type: 'temporal', timeUnit: 'utcyearmonthdate',
          title: null,
          axis: {
            titleFontSize: 12, labelFontSize: 12, tickCount: 24,
            format: getDateFormat(chart_options.aggregate), labelAngle: -10
          },
          scale: {
            domain: [chart_options.start_date, chart_options.end_date]
          }
        },
        y: {
          field: 'value', type: 'quantitative', title: `# of ${unit}s`,
          axis: {
            titleFontSize: 12, labelFontSize: 12, tickCount: 5
          }
        },
        color: {field: 'color', type: 'nominal', scale: null},
        size: {field: 'size', type: 'quantitative', scale: null},
        href: {field: 'video_href', type: 'nominal'},
        tooltip: [
          {field: 'time', type: 'temporal', timeUnit: 'utcyearmonthdate', title: 'time', format: getDateFormat(chart_options.aggregate)},
          {field: 'query', type: 'nominal'},
          {field: 'value', type: 'quantitative'}
        ]
      }
    }]
  };
  vega_opts = {
    loader: {'target': '_blank'},
    actions: false
  };
  vegaEmbed(div_id, vega_spec, vega_opts);
}

function getQueryOptions(chart_options, query_filters) {
  let options = query_filters;
  options.start_date = chart_options.start_date;
  options.end_date = chart_options.end_date;
  options.aggregate = chart_options.aggregate;
  options.window = chart_options.window;
  return options;
}

function parseFilters(filter_str) {
  let filters = {};
  if (filter_str) {
    filter_str.split(';').forEach(line => {
      line = $.trim(line);
      if (line.length > 0) {
        let i = line.indexOf(':');
        if (i == -1) {
          throw Error(`Invalid filter: ${line}`);
        }
        let k = $.trim(line.substr(0, i));
        let v = $.trim(line.substr(i + 1));
        filters[k] = v;
      }
    });
  }
  return filters;
}

function normalizeFilters(filters) {
  let result = {};
  Object.keys(filters).forEach(k => {
    let v = filters[k];
    let v_up = v.toUpperCase();
    if (k == 'channel') {
      if (v_up == 'ALL') {
        // pass
      } else if (v_up == 'FOX') {
        result.channel = 'FOXNEWS';
      } else if (v_up == 'CNN' || v_up == 'MSNBC' ||  v_up == 'FOXNEWS') {
        result.channel = v_up;
      } else {
        throw Error(`Unknown channel: ${v}`);
      }
    } else if (k == 'show') {
      if (v == 'ALL') {
        // pass
      } else {
        var show = null;
        for (var i in ALL_SHOWS) {
          if (ALL_SHOWS[i].toUpperCase() == v_up) {
            show = ALL_SHOWS[i];
            break;
          }
        }
        if (show) {
          result.show = show;
        } else {
          throw Error(`'Unknown show: ${v}`);
        }
      }
    } else if (k == 'dayofweek' || k == 'hours') {
      result[k] = filters[k];
    } else {
      throw Error(`Unknown filter: ${k}`);
    }
  });
  return result;
}