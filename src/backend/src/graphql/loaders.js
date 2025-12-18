function toUuidArray(ids) {
  return (ids || []).filter(Boolean).map((x) => String(x));
}

function createBatchLoader(batchFn) {
  const cache = new Map();
  let queued = [];
  let scheduled = false;

  async function flush() {
    scheduled = false;

    const entries = queued;
    queued = [];

    const keys = [];
    const perKeyResolvers = new Map();

    for (const { key, resolve, reject } of entries) {
      if (cache.has(key)) {
        resolve(cache.get(key));
        continue;
      }

      if (!perKeyResolvers.has(key)) {
        perKeyResolvers.set(key, []);
        keys.push(key);
      }
      perKeyResolvers.get(key).push({ resolve, reject });
    }

    if (keys.length === 0) return;

    try {
      const values = await batchFn(keys);

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = values[i];
        cache.set(key, value);
        for (const r of perKeyResolvers.get(key) || []) {
          r.resolve(value);
        }
      }
    } catch (err) {
      for (const key of keys) {
        for (const r of perKeyResolvers.get(key) || []) {
          r.reject(err);
        }
      }
    }
  }

  return {
    load(key) {
      if (key === null || key === undefined) return Promise.resolve(null);
      const k = String(key);
      if (cache.has(k)) return Promise.resolve(cache.get(k));

      return new Promise((resolve, reject) => {
        queued.push({ key: k, resolve, reject });
        if (!scheduled) {
          scheduled = true;
          queueMicrotask(flush);
        }
      });
    },

    clear() {
      cache.clear();
    },
  };
}

export function createLoaders(dbPool, { entityService } = {}) {
  const entitiesById = createBatchLoader(async (ids) => {
    const uuidIds = toUuidArray(ids);
    if (uuidIds.length === 0) return ids.map(() => null);

    const [entitiesRes, attrsRes, tagsRes] = await Promise.all([
      dbPool.query(
        `
          SELECT id, entity_type, display_name, metadata, created_at, updated_at
          FROM entities
          WHERE id = ANY($1::uuid[])
        `,
        [uuidIds]
      ),
      dbPool.query(
        `
          SELECT id, entity_id, attribute_name, attribute_value, confidence, created_at, updated_at
          FROM entity_attributes
          WHERE entity_id = ANY($1::uuid[])
          ORDER BY created_at ASC
        `,
        [uuidIds]
      ),
      dbPool.query(
        `
          SELECT et.entity_id, t.name
          FROM entity_tags et
          JOIN tags t ON t.id = et.tag_id
          WHERE et.entity_id = ANY($1::uuid[])
          ORDER BY t.name ASC
        `,
        [uuidIds]
      ),
    ]);

    const attrsByEntityId = new Map();
    for (const row of attrsRes.rows || []) {
      const entityId = String(row.entity_id);
      if (!attrsByEntityId.has(entityId)) attrsByEntityId.set(entityId, []);
      const formatted = entityService?.formatAttribute
        ? entityService.formatAttribute(row)
        : {
            id: row.id,
            entityId: row.entity_id,
            attributeName: row.attribute_name,
            attributeValue: row.attribute_value,
            confidence: row.confidence != null ? parseFloat(row.confidence) : null,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          };
      attrsByEntityId.get(entityId).push(formatted);
    }

    const tagsByEntityId = new Map();
    for (const row of tagsRes.rows || []) {
      const entityId = String(row.entity_id);
      if (!tagsByEntityId.has(entityId)) tagsByEntityId.set(entityId, []);
      tagsByEntityId.get(entityId).push(row.name);
    }

    const entityRowById = new Map();
    for (const row of entitiesRes.rows || []) {
      entityRowById.set(String(row.id), row);
    }

    return ids.map((id) => {
      const row = entityRowById.get(String(id));
      if (!row) return null;

      const entity = {
        ...row,
        attributes: attrsByEntityId.get(String(row.id)) || [],
        tags: tagsByEntityId.get(String(row.id)) || [],
      };

      return entityService?.formatEntity ? entityService.formatEntity(entity) : {
        id: entity.id,
        entityType: entity.entity_type,
        displayName: entity.display_name,
        attributes: entity.attributes,
        tags: entity.tags,
        metadata: entity.metadata,
        createdAt: entity.created_at,
        updatedAt: entity.updated_at,
      };
    });
  });

  const eventEntitiesByEventId = createBatchLoader(async (eventIds) => {
    const uuidEventIds = toUuidArray(eventIds);
    if (uuidEventIds.length === 0) return eventIds.map(() => []);

    try {
      const res = await dbPool.query(
        `
          SELECT event_id, entity_id, role, confidence
          FROM event_entities
          WHERE event_id = ANY($1::uuid[])
          ORDER BY event_id ASC, entity_id ASC
        `,
        [uuidEventIds]
      );

      const grouped = new Map();
      for (const id of uuidEventIds) grouped.set(id, []);
      for (const row of res.rows || []) {
        const eventId = String(row.event_id);
        if (!grouped.has(eventId)) grouped.set(eventId, []);
        grouped.get(eventId).push({
          eventId: row.event_id,
          entityId: row.entity_id,
          role: row.role,
          confidence: row.confidence != null ? parseFloat(row.confidence) : null,
        });
      }

      return eventIds.map((id) => grouped.get(String(id)) || []);
    } catch (error) {
      // Backward-compatible behavior if table doesn't exist.
      if (error?.code === '42P01' || /event_entities.*does not exist/i.test(error?.message || '')) {
        return eventIds.map(() => []);
      }
      throw error;
    }
  });

  const presenceEntitiesByPresenceId = createBatchLoader(async (presenceIds) => {
    const uuidPresenceIds = toUuidArray(presenceIds);
    if (uuidPresenceIds.length === 0) return presenceIds.map(() => []);

    const res = await dbPool.query(
      `
        SELECT presence_id, entity_id, role, confidence
        FROM presence_entities
        WHERE presence_id = ANY($1::uuid[])
        ORDER BY presence_id ASC, entity_id ASC
      `,
      [uuidPresenceIds]
    );

    const grouped = new Map();
    for (const id of uuidPresenceIds) grouped.set(id, []);
    for (const row of res.rows || []) {
      const presenceId = String(row.presence_id);
      if (!grouped.has(presenceId)) grouped.set(presenceId, []);
      grouped.get(presenceId).push({
        presenceId: row.presence_id,
        entityId: row.entity_id,
        role: row.role,
        confidence: row.confidence != null ? parseFloat(row.confidence) : null,
      });
    }

    return presenceIds.map((id) => grouped.get(String(id)) || []);
  });

  return {
    entitiesById,
    eventEntitiesByEventId,
    presenceEntitiesByPresenceId,
  };
}
