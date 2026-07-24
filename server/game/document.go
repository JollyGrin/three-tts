package game

import "reflect"

// Helpers for walking the decoded JSON document. Everything the server stores
// comes out of encoding/json, so maps are map[string]any, arrays are []any and
// numbers are float64.

func deepCopy(value any) any {
	switch v := value.(type) {
	case map[string]any:
		return deepCopyMap(v)
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = deepCopy(item)
		}
		return out
	default:
		return v
	}
}

func deepCopyMap(m map[string]any) map[string]any {
	if m == nil {
		return nil
	}
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = deepCopy(v)
	}
	return out
}

// collection returns a collection map (cards/decks/players/…), creating it when
// create is set. Returns nil when absent (or present but not an object).
func collection(data map[string]any, name string, create bool) map[string]any {
	if existing, ok := data[name].(map[string]any); ok {
		return existing
	}
	if !create {
		return nil
	}
	created := map[string]any{}
	data[name] = created
	return created
}

// entity returns one entity out of a collection, or nil when it does not exist.
func entity(data map[string]any, col, id string) map[string]any {
	c := collection(data, col, false)
	if c == nil {
		return nil
	}
	ent, _ := c[id].(map[string]any)
	return ent
}

// floats reads a numeric array field, padding to n with zeroes so callers can
// index without bounds checks.
func floats(value any, n int) []float64 {
	out := make([]float64, n)
	arr, ok := value.([]any)
	if !ok {
		return out
	}
	for i := 0; i < n && i < len(arr); i++ {
		if f, ok := arr[i].(float64); ok {
			out[i] = f
		}
	}
	return out
}

func anyFloats(values []float64) []any {
	out := make([]any, len(values))
	for i, v := range values {
		out[i] = v
	}
	return out
}

func strSlice(value any) []string {
	arr, ok := value.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(arr))
	for _, item := range arr {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// diffMaps produces the JSON merge patch that turns old into new: changed keys
// carry their new value, keys that vanished carry nil (a JSON null, which the
// client store treats as a delete). Nested objects recurse; arrays and scalars
// replace wholesale, matching MergeMaps on the way in.
func diffMaps(old, new map[string]any) map[string]any {
	patch := map[string]any{}
	for key, nv := range new {
		ov, present := old[key]
		if !present {
			patch[key] = nv
			continue
		}
		if nm, ok := nv.(map[string]any); ok {
			if om, ok := ov.(map[string]any); ok {
				if sub := diffMaps(om, nm); len(sub) > 0 {
					patch[key] = sub
				}
				continue
			}
			patch[key] = nv
			continue
		}
		if !reflect.DeepEqual(ov, nv) {
			patch[key] = nv
		}
	}
	for key := range old {
		if _, present := new[key]; !present {
			patch[key] = nil
		}
	}
	return patch
}
