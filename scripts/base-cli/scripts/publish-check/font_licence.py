"""The copyright notice at the top of a SIL Open Font License text."""
import re

# The licence text itself, not a path or a mention of the licence: its title
# line followed by sections only the full text carries.
TITLE = re.compile(r'(?im)^[ \t]*SIL OPEN FONT LICENSE[ \t]+Version[ \t]+1\.1\b.*$')
BODY = ('PERMISSION & CONDITIONS', 'Reserved Font Name', 'Font Software')
NOTICE = re.compile(r'(?im)^[ \t]*Copyright\b.*$')


def without_required_notices(text):
    """Drop the notice lines above the licence title of a full OFL text.

    The licence obliges a redistributor to keep these lines, so the address in
    one is required attribution. Anything else in the file, and the same
    notice in a file that is not an OFL text, stays visible.
    """
    title = TITLE.search(text)
    if not title or not all(part.lower() in text[title.end():].lower() for part in BODY):
        return text
    return NOTICE.sub('', text[:title.start()]) + text[title.start():]
