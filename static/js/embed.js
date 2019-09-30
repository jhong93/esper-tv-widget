let params = (new URL(document.location)).searchParams;
let data = JSON.parse(decodeURIComponent(params.get('data')));
let width = params.get('width');
let height = params.get('height');
let chart_options = data.options;

function renderText(lines) {
  // TODO: XSS attack here
  lines.forEach(line => {
    $('#search-table tbody').append(
      $('<tr />').append(
        $('<td />').append(`<div class="color-box" style="background-color: ${line.color};" />`),
        $('<td />').append(
          $('<code />').text(line.query.query),
          $.trim(line.query.query).endsWith('WHERE') ?
            $('<code />').css('color', 'gray').text('all the data') : null
        )
      ));
  });
  $('#options').append(
    'Showing results from ',
    $('<b />').text(chart_options.start_date),
    ' to ',
    $('<b />').text(chart_options.end_date),
    ' aggregated by ',
    $('<b />').text(chart_options.aggregate)
  );
}

let lines = data.queries.map(raw_query => {
  var parsed;
  try {
    parsed_query = new SearchableQuery(
      raw_query.text, chart_options.count, false);
  } catch (e) {
    alertAndThrow(e.message);
  }
  return {color: raw_query.color, query: parsed_query};
});

$('#shade').show();
$('#search').prop('disabled', true);

let search_results = {};
function onDone() {
  new Chart(
    chart_options, search_results, {width: width, height: height}
  ).load('#chart', null);
  renderText(lines);
};

Promise.all(lines.map(line => {
  console.log('Executing query:', line.query);

  function onError(xhr) {
    var msg;
    try {
      msg = JSON.parse(xhr.responseText).message;
    } catch {
      msg = 'Unknown server error';
    }
    alert(`[Query failed. The chart may be incomplete.]\n\n${msg}`);
    console.log('Failed:', line, xhr);
  }

  return line.query.search(
    chart_options,
    result => search_results[line.color] = result,
    onError);
})).then(onDone).catch(onDone);