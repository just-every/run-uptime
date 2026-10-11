#!/usr/bin/env python3
import argparse
import json
from history_scan import scan


class SafeParser(argparse.ArgumentParser):
    def error(self, message):
        self.exit(2, 'publish-check invalid arguments\n')


def seconds(value):
    result = float(value)
    if not 0 < result <= 7200:
        raise argparse.ArgumentTypeError('invalid timeout')
    return result


def main():
    parser = SafeParser(description='Scan working files and full history with system Git and pinned Gitleaks.')
    parser.add_argument('--repo', required=True)
    parser.add_argument('--ref', default='HEAD')
    for option in ('public-base', 'env-file', 'project', 'repository', 'cache-dir'):
        parser.add_argument('--' + option)
    parser.add_argument('--timeout-seconds', type=seconds, default=300)
    args = parser.parse_args()
    report = scan(args.repo, args.ref, args.public_base, args.env_file, args.project, args.repository,
                  cache_dir=args.cache_dir, timeout=args.timeout_seconds)
    print(json.dumps(report))
    return {'PASS': 0, 'FAIL': 1, 'INCOMPLETE': 2}[report['status']]


if __name__ == '__main__':
    raise SystemExit(main())
