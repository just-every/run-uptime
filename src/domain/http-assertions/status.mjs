const exact = value => Number.isInteger(value) && value >= 100 && value <= 599;
function range(value) {
  if (typeof value !== 'string') return;
  if (/^[1-5]xx$/.test(value)) return [Number(value[0]) * 100, Number(value[0]) * 100 + 99];
  const match = /^([1-5][0-9]{2})-([1-5][0-9]{2})$/.exec(value);
  if (match && Number(match[1]) <= Number(match[2])) return [Number(match[1]), Number(match[2])];
}
export function validateStatus(expected) {
  if (exact(expected)) return;
  if (!Array.isArray(expected) || !expected.length || expected.length > 20 ||
      expected.some(value => !exact(value) && !range(value))) {
    throw Error('Invalid expected status: use a status number or up to 20 numbers/ranges, such as [200, 204, "2xx", "400-404"]');
  }
}
export function statusMatches(status, expected) {
  return (Array.isArray(expected) ? expected : [expected]).some(value => {
    if (typeof value === 'number') return status === value;
    const bounds = range(value);
    return Boolean(bounds && status >= bounds[0] && status <= bounds[1]);
  });
}
