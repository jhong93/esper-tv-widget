from datetime import datetime
from enum import Enum
from typing import Callable, Dict, List, Set, Tuple, NamedTuple, Union

from rs_intervalset import MmapIntervalSetMapping       # type: ignore


class Aggregate(Enum):
    day = 'day'
    week = 'week'
    month = 'month'
    year = 'year'


class Countable(Enum):
    mentions = 'mentions'
    facetime = 'face time'
    videotime = 'video time'


class Ternary(Enum):
    true = 'true'
    false = 'false'
    both = 'both'


class Video(NamedTuple):
    id: int
    name: str
    show: str
    channel: str
    date: datetime
    dayofweek: int
    hour: int
    num_frames: int
    fps: float
    width: int
    height: int


class FaceIntervals(NamedTuple):
    all: MmapIntervalSetMapping
    male: MmapIntervalSetMapping
    female: MmapIntervalSetMapping
    host: MmapIntervalSetMapping
    nonhost: MmapIntervalSetMapping
    male_host: MmapIntervalSetMapping
    male_nonhost: MmapIntervalSetMapping
    female_host: MmapIntervalSetMapping
    female_nonhost: MmapIntervalSetMapping


PersonIntervals = Dict[str, MmapIntervalSetMapping]

Number = Union[int, float]
Interval = Tuple[Number, Number]
Caption = Tuple[float, float, str]
JsonObject = Dict[str, object]

VideoFilterFn = Callable[[Video], bool]
AggregateFn = Callable[[datetime], datetime]
OnScreenFilterFn = Callable[[int, int], bool]
FaceTimeAggregateFn = Callable[[Video, List[Interval]], float]
FaceTimeIntersectFn = Callable[[Video, List[Interval]], List[Interval]]
