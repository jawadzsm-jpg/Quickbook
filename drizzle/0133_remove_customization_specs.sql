-- Product Customization used to write RAM, Storage and Part Number into the item's specifications (appending them, or
-- replacing an entry with the same label), so they showed in the product line. Saving no longer does that; this
-- removes the entries it appended. Only the trailing run of entries is removed, walking back from the end of the list,
-- and only while each entry is labelled RAM / Storage with the item's customization value, or Part Number with the
-- item's part number when that number is also written earlier in the list. Specifications typed in the middle of the
-- list are kept. Every change is logged in audit_log with the previous specifications, so it can be restored.
DO $$
DECLARE
  r record;
  specs jsonb;
  kept jsonb;
  removed_text text;
  n integer;
  i integer;
  cut integer;
  entry jsonb;
  entry_label text;
  entry_value text;
  extra boolean;
BEGIN
  FOR r IN
    SELECT id, company_id, specifications,
      upper(trim(customization_ram)) AS ram, upper(trim(customization_storage)) AS storage, upper(trim(part_number)) AS part_number
    FROM items
    WHERE customization_ram <> '' OR customization_storage <> '' OR part_number <> ''
  LOOP
    BEGIN
      specs := r.specifications::jsonb;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    IF jsonb_typeof(specs) <> 'array' THEN
      CONTINUE;
    END IF;
    n := jsonb_array_length(specs);
    cut := n;
    i := n - 1;
    WHILE i >= 0 LOOP
      entry := specs -> i;
      entry_label := upper(trim(coalesce(entry ->> 'label', '')));
      entry_value := upper(trim(coalesce(entry ->> 'value', '')));
      extra := entry_value <> '' AND (
        (entry_label = 'RAM' AND entry_value = r.ram)
        OR (entry_label = 'STORAGE' AND entry_value = r.storage)
        OR (entry_label = 'PART NUMBER' AND entry_value = r.part_number AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(specs) WITH ORDINALITY AS earlier(value, position)
          WHERE earlier.position - 1 < i AND upper(trim(coalesce(earlier.value ->> 'value', ''))) = entry_value
        ))
      );
      EXIT WHEN NOT extra;
      cut := i;
      i := i - 1;
    END LOOP;
    IF cut < n THEN
      SELECT coalesce(jsonb_agg(spec.value ORDER BY spec.position), '[]'::jsonb) INTO kept
        FROM jsonb_array_elements(specs) WITH ORDINALITY AS spec(value, position) WHERE spec.position - 1 < cut;
      SELECT string_agg(coalesce(spec.value ->> 'label', '') || ': ' || coalesce(spec.value ->> 'value', ''), '; ' ORDER BY spec.position) INTO removed_text
        FROM jsonb_array_elements(specs) WITH ORDINALITY AS spec(value, position) WHERE spec.position - 1 >= cut;
      UPDATE items SET specifications = kept::text WHERE id = r.id;
      INSERT INTO audit_log (company_id, action, entity_type, entity_id, details)
        VALUES (r.company_id, 'updated', 'item', r.id, 'Removed specifications added by Product Customization (migration 0133): ' || removed_text || '. Previous specifications: ' || r.specifications);
    END IF;
  END LOOP;
END $$;
