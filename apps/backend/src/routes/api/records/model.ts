import { t } from 'elysia';
import { RECORD_FILTERS } from '#models/records.ts';
export const RecordParams = t.Object({ id: t.String({ pattern: '^rec-[0-9a-f-]{36}$' }) });
export const CreateRecord = t.Object({
  url: t.String({ minLength: 1, maxLength: 4096 }),
  title: t.Optional(t.String({ maxLength: 300 })),
});
export const EditRecord = t.Object({
  title: t.String({ minLength: 1, maxLength: 300, pattern: '.*\\S.*' }),
  markdown: t.String({ maxLength: 1000000 }),
});
export const ListRecords = t.Object({
  status: t.Optional(t.Union(RECORD_FILTERS.map((value) => t.Literal(value)))),
  playlistId: t.Optional(t.String({ pattern: '^pl-[0-9a-f-]{36}$' })),
  search: t.Optional(t.String({ maxLength: 200 })),
  offset: t.Optional(t.Numeric({ minimum: 0, maximum: 1000000, multipleOf: 1 })),
});

export const ImportCaptions = t.Object({
  content: t.String({ minLength: 1, maxLength: 1800000 }),
  format: t.Union([t.Literal('json3'), t.Literal('vtt'), t.Literal('srt')]),
  sourceUrl: t.Optional(t.String({ maxLength: 4096 })),
  title: t.Optional(t.String({ minLength: 1, maxLength: 300 })),
  duration: t.Optional(t.Number({ minimum: 0, maximum: 10800 })),
});
