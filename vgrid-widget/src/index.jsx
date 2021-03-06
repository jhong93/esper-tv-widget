import React from 'react';
import ReactDOM from 'react-dom';
import {
  VGrid, Database, Table, Bounds, BoundingBox, Interval, IntervalSet,
  SpatialType_Temporal, SpatialType_Caption, SpatialType_Bbox
} from '@wcrichto/vgrid';

import '@wcrichto/vgrid/dist/vgrid.css';

const FACE_FADE_PARAMS = {amount: 0.75};

const INTERNET_ARCHIVE_MAX_CLIP_LEN = 180;
const INTERNET_ARCHIVE_PAD_START = 30;

// From values.js
const NAMES_TO_SHOW = ALL_PEOPLE_LOWER_CASE_SET;

function getHighlightIndexes(captions, extra_options) {
  let highlight_idxs = new Set();
  if (extra_options.highlight_phrases) {
    let highlight_phrase_arr = Array.from(extra_options.highlight_phrases);
    let max_highlight_len = 1 + Math.max(
      ...(highlight_phrase_arr.map(p => p.split(' ').length))
    );
    for (var i = 0; i < captions.length; i++) {
      var prefix = '';
      for (var j = i; j < Math.min(captions.length, i + max_highlight_len); j++) {
        prefix += $.trim(captions[j][2]).replace(/[!\.\?;:(),]/i, '').toLowerCase();
        if (highlight_phrases.has(prefix)) {
          for (var k = i; k <= j; k++) {
            highlight_idxs.add(k);
          }
        }
        prefix += ' ';

        // early termination
        var matches_prefix = false;
        highlight_phrase_arr.forEach(p => {
          matches_prefix |= p.startsWith(prefix);
        });
        if (!matches_prefix) break;
      }
    }
  }
  return highlight_idxs;
}

function sanitizeName(name) {
  return $.trim(name).replace(/'|\./, '').toLowerCase();
}

function flattenCaption(caption) {
  let [start, end, text] = caption;
  let bounds = new Bounds(start, end);
  return text.split(' ').map(token => [start, end, token]);
}

function getVideoTitle(video) {
  let [y, m, d] = video.date.split('-').map(x => Number.parseInt(x));
  let show = video.show.length > 0 ? video.show : '&lt;unnamed&gt;';
  return $('<span>').attr('title', video.name).text(`${video.channel}, ${show} on ${m}/${d}/${y}`).prop('outerHTML');
}

function getSourceLink(source_options, video, start, end) {
  var url = `${source_options.url}/${video.name}`;
  if (start !== undefined && end !== undefined) {
    url += `/start/${Math.floor(start)}/end/${Math.floor(end)}`;
  }
  return $('<span>').addClass('archive-logo').append(
    $('<a>').attr({href: url, target: '_blank', title: source_options.title}).append(
      $('<img>').attr('src', source_options.img_url))
  ).prop('outerHTML');
};

function loadJsonData(json_data, caption_data, face_data, extra_options) {
  let videos = [];
  let interval_blocks = [];
  let highlight_style = extra_options.highlight_style;

  json_data.forEach(video_json => {
    let video_id = video_json.metadata.id;
    let video_name = video_json.metadata.name;
    let duration = video_json.metadata.num_frames / video_json.metadata.fps;

    videos.push({
      id: video_id,
      width: video_json.metadata.width,
      height: video_json.metadata.height,
      fps: video_json.metadata.fps,
      num_frames: video_json.metadata.num_frames,
      path: `${video_name}.mp4`
    });

    let empty_interval = new Interval(
      new Bounds(0, duration), {
        spatial_type: new SpatialType_Caption('No captions found.', null),
        metadata: {}
      }
    );

    let captions = _.get(caption_data, video_id, []).flatMap(flattenCaption);
    let highlight_idxs = getHighlightIndexes(captions, extra_options);
    let caption_intervals = captions.map(
      (caption, i) => {
        let [start, end, text] = caption;
        let bounds = new Bounds(start, end);
        return new Interval(
          bounds, {
            spatial_type: new SpatialType_Caption(
              text, highlight_idxs.has(i) ? highlight_style : null),
            metadata: {}
          }
        );
      }
    );

    let video_face_data = _.get(face_data, video_id, {ids: [], faces: []});
    let faces = video_face_data.faces;
    let face_id_to_name = video_face_data.ids.reduce((acc, x) => {
      if (NAMES_TO_SHOW.has(sanitizeName(x[0]))) {
        acc[x[1]] = x[0];
      }
      return acc;
    }, {});
    let makeFaceInterval = function(face) {
      let [x1, y1, x2, y2] = face.b;
      let [t0, t1] = face.t;
      return new Interval(
        new Bounds(t0, t1, new BoundingBox(x1, x2, y1, y2)),
        {
          spatial_type: new SpatialType_Bbox({
            fade: FACE_FADE_PARAMS,
            text: face.i && face_id_to_name.hasOwnProperty(face.i)
              ? face_id_to_name[face.i] : null
          })
        }
      );
    };

    let video_title_parts = [getVideoTitle(video_json.metadata)];
    if (extra_options.video_source_link) {
      video_title_parts.push(
        getSourceLink(extra_options.video_source_link, video_json.metadata));
    }
    interval_blocks.push({
      video_id: video_id,
      title: video_title_parts.join(' '),
      interval_sets: [{
        name: 'results',
        interval_set: new IntervalSet(
          video_json.intervals.map(interval => {
            let [start, end] = interval;
            return new Interval(
              new Bounds(start, end),
              {spatial_type: SpatialType_Temporal.get_instance(), metadata: {}}
            );
          }))
      }, {
        name: '_male_faces',
        interval_set: new IntervalSet(
          faces.filter(f => f.g.toLowerCase() == 'm').map(makeFaceInterval))
      }, {
        name: '_female_faces',
        interval_set: new IntervalSet(
          faces.filter(f => f.g.toLowerCase() == 'f').map(makeFaceInterval))
      }, {
        name: '_captions',
        interval_set: new IntervalSet(
          caption_intervals.length > 0 ? caption_intervals : [empty_interval])
      }]
    });
  });

  let database = new Database([new Table('videos', videos)]);
  return [database, interval_blocks];
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function format_time(s) {
  let h = Math.floor(s / 3600);
  s -= h * 3600;
  let m = Math.floor(s / 60);
  s -= m * 60;
  let pad = x => x.toString().padStart(2, '0');
  var ret = `${pad(m)}m ${pad(Math.floor(s))}s`;
  if (h > 0) {
    ret = `${h}h ` + ret;
  }
  return ret;
}

function loadJsonDataForInternetArchive(json_data, caption_data, face_data,
                                        extra_options) {
  let videos = [];
  let interval_blocks = [];
  let highlight_style = extra_options.highlight_style;

  json_data.forEach(video_json => {
    let video_id = video_json.metadata.id;
    let video_name = video_json.metadata.name;

    let selected_interval = randomChoice(video_json.intervals);
    let block_start = Math.max(
      Math.floor(selected_interval[0] - INTERNET_ARCHIVE_PAD_START), 0);
    let block_end = Math.min(
      block_start + INTERNET_ARCHIVE_MAX_CLIP_LEN,
      video_json.metadata.num_frames / video_json.metadata.fps);
    let block_length = block_end - block_start;

    videos.push({
      id: video_id,
      width: video_json.metadata.width,
      height: video_json.metadata.height,
      fps: video_json.metadata.fps,
      num_frames: (block_end - block_start) * video_json.metadata.fps,
      path: `${video_name}/${video_name}.mp4?start=${block_start}&end=${block_end}&exact=1&ignore=x.mp4`
    });

    let filterIntervals = function(interval) {
      let start = interval[0];
      let end = interval[1];
      return Math.min(block_end, end) - Math.max(block_start, start) >= 0;
    };

    let makeBounds = function(start, end, bbox) {
      return new Bounds(
        Math.min(Math.max(start - block_start, 0), block_length),
        Math.min(Math.max(end - block_start, 0), block_length),
        bbox);
    };

    let empty_interval = new Interval(
      makeBounds(block_start, block_end), {
        spatial_type: new SpatialType_Caption('No captions found.', null),
        metadata: {}
      }
    );

    let captions = _.get(caption_data, video_id, []).filter(
      filterIntervals
    ).flatMap(flattenCaption);
    let highlight_idxs = getHighlightIndexes(captions, extra_options);
    let caption_intervals = captions.map(
      (caption, i) => {
        let [start, end, text] = caption;
        let bounds = makeBounds(start, end);
        return new Interval(
          bounds, {
            spatial_type: new SpatialType_Caption(
              text, highlight_idxs.has(i) ? highlight_style : null),
            metadata: {}
          }
        );
      }
    );

    let video_face_data = _.get(face_data, video_id, {ids: [], faces: []});
    let faces = video_face_data.faces.filter(face => {
      let [start, end] = face.t;
      return Math.min(block_end, end) - Math.max(block_start, start) >= 0;
    });
    let face_id_to_name = video_face_data.ids.reduce((acc, x) => {
      if (NAMES_TO_SHOW.has(sanitizeName(x[0]))) {
        acc[x[1]] = x[0];
      }
      return acc;
    }, {});

    let makeFaceInterval = function(face) {
      let [x1, y1, x2, y2] = face.b;
      let [t0, t1] = face.t;
      return new Interval(
        makeBounds(t0, t1, new BoundingBox(x1, x2, y1, y2)),
        {
          spatial_type: new SpatialType_Bbox({
            fade: FACE_FADE_PARAMS,
            text: face.i && face_id_to_name.hasOwnProperty(face.i)
              ? face_id_to_name[face.i] : null
          })
        }
      );
    };

    let video_title_parts = [
      getVideoTitle(video_json.metadata),
      `(from ${format_time(block_start)} to ${format_time(block_end)})`
    ];
    if (extra_options.video_source_link) {
      video_title_parts.push(
        getSourceLink(extra_options.video_source_link, video_json.metadata,
                      block_start, block_end));
    }
    interval_blocks.push({
      video_id: video_id,
      title: video_title_parts.join(' '),
      interval_sets: [{
        name: 'results',
        interval_set: new IntervalSet(
          video_json.intervals.filter(
            filterIntervals
          ).map(interval => {
            let [start, end] = interval;
            return new Interval(
              makeBounds(start, end),
              {spatial_type: SpatialType_Temporal.get_instance(), metadata: {}}
            );
          }))
      }, {
        name: '_male_faces',
        interval_set: new IntervalSet(
          faces.filter(f => f.g.toLowerCase() == 'm').map(makeFaceInterval))
      }, {
        name: '_female_faces',
        interval_set: new IntervalSet(
          faces.filter(f => f.g.toLowerCase() == 'f').map(makeFaceInterval))
      }, {
        name: '_captions',
        interval_set: new IntervalSet(
          caption_intervals.length > 0 ? caption_intervals : [empty_interval])
      }]
    });
  });

  let database = new Database([new Table('videos', videos)]);
  return [database, interval_blocks];
}

function renderVGrid(
  container, json_data, caption_data, face_data, vgrid_settings,
  use_archive, extra_options
) {
  if (extra_options == undefined) {
    extra_options = {};
  }
  let [database, interval_blocks] = use_archive ?
    loadJsonDataForInternetArchive(
      json_data, caption_data, face_data, extra_options
    ) : loadJsonData(json_data, caption_data, face_data, extra_options);
  ReactDOM.render(
    <VGrid interval_blocks={interval_blocks} database={database}
           settings={vgrid_settings} />,
    document.getElementById(container));
}

window.renderVGrid = renderVGrid;
