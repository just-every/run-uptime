"""Caller-compatible, value-free publication reports."""
from policy import safe_path
from reviewed import FORBIDDEN


def new_report(public_base=False):
    return dict(schema='rer.publish-check/v3', status='INCOMPLETE', complete=False, source=None,
                scanner=dict(name='gitleaks', version='8.30.1'),
                history=dict(scope='selected-and-public-base' if public_base else 'all-local-refs-and-selected-commit',
                             commits=0, trees=0, blobs=0, commitMessages=0, tagMessages=0),
                findings=[], preExisting=[], warnings=[], fixtures=[], reviewed=[], info=[],
                guarantees=dict(historyScanned=False, visualRecognition=False, environmentChecked=False))


class Findings:
    def __init__(self, report, reviewed, env_hashes):
        self.report, self.reviewed, self.env_hashes = report, reviewed, env_hashes
        self.seen = {}

    def add(self, rule, path, commit=None, oid=None, scope='newly-public', bucket=None, scanner_rule=None):
        bucket = bucket or ('preExisting' if scope == 'pre-existing' and rule != 'secret.env-match' else 'findings')
        if rule in ('pending-public-destination', 'provenance.declared-source'):
            bucket = 'info'
        if (rule, path, oid) in self.reviewed and bucket != 'info':
            if rule in FORBIDDEN:
                self.add('reviewed.forbidden', path, commit, oid, scope)
            else:
                bucket = 'reviewed'
        key = (bucket, rule, path, oid, scanner_rule)
        if key in self.seen:
            item = self.seen[key]
            if commit not in item['commits']:
                item['commits'].append(commit)
            if scope not in item['scopes']:
                item['scopes'].append(scope)
            return
        item = dict(rule=rule, path=safe_path(path, self.env_hashes), commit=commit, commits=[commit], scope=scope, scopes=[scope])
        if oid:
            item['blob'] = oid
        if scanner_rule:
            item['scannerRule'] = scanner_rule
        if bucket == 'info':
            item['severity'] = 'INFO'
        self.seen[key] = item
        self.report[bucket].append(item)


def finish(report):
    report['complete'] = not any(f['rule'].startswith('scan.') for bucket in ('findings', 'preExisting') for f in report[bucket])
    report['guarantees']['historyScanned'] = report['complete']
    report['status'] = 'INCOMPLETE' if not report['complete'] else 'FAIL' if report['findings'] else 'PASS'
    return report
