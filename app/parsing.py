import json
from typing import Optional

from .types import *
from .error import InvalidUsage


def load_json(file_path: str) -> JsonObject:
    with open(file_path, 'rb') as f:
        return json.load(f)


def parse_date(s: Optional[str]) -> Optional[datetime]:
    return datetime.strptime(s, '%Y-%m-%d') if s else None


def format_date(d: datetime) -> str:
    return d.strftime('%Y-%m-%d')


def parse_hour_set(s: Optional[str]) -> Optional[Set[int]]:
    if s is None or not s.strip():
        return None
    result: Set[int] = set()
    for t in s.strip().split(','):
        if t == '':
            continue
        elif '-' in t:
            t0_str, t1_str = t.split('-', 1)
            t0 = int(t0_str)
            t1 = int(t1_str)
            if t0 >= 0 and t0 <= 23 and t1 >= 0 and t1 <= 23:
                result.update(range(t0, t1 + 1))
            else:
                raise InvalidUsage('invalid hour range: {}'.format(t))
        else:
            t0 = int(t)
            if t0 >= 0 and t0 <= 23:
                result.add(t0)
            else:
                raise InvalidUsage('invalid hour: {}'.format(t))
    return result if result else None


DAYS_OF_WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']


def parse_day_of_week_set(s: Optional[str]) -> Optional[Set[int]]:
    if s is None or not s.strip():
        return None
    result: Set[int] = set()
    for t in s.strip().split(','):
        t_low = t.lower()
        try:
            if t_low == '':
                continue
            elif '-' in t:
                t0, t1 = t_low.split('-', 1)
                result.update(range(
                    DAYS_OF_WEEK.index(t0) + 1,
                    DAYS_OF_WEEK.index(t1) + 2))
            else:
                result.add(DAYS_OF_WEEK.index(t_low) + 1)
        except ValueError:
            raise InvalidUsage('invalid day of week: {}'.format(t))
    return result if result else None