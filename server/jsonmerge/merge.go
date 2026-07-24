package jsonmerge

import (
	"encoding/json"
	"fmt"
)

// MergeMaps merges patch into dst (in place) with the same semantics as the
// client store: nested objects merge recursively, null deletes the key,
// arrays and scalars replace. Patch subtrees are adopted directly, so the
// patch must come freshly decoded and not be reused afterwards.
func MergeMaps(dst, patch map[string]any) map[string]any {
	if dst == nil {
		dst = make(map[string]any, len(patch))
	}
	for k, v := range patch {
		if v == nil {
			delete(dst, k)
			continue
		}
		if pm, ok := v.(map[string]any); ok {
			if dm, ok := dst[k].(map[string]any); ok {
				dst[k] = MergeMaps(dm, pm)
				continue
			}
			// fresh subtree: still recurse so nested nulls are stripped
			dst[k] = MergeMaps(make(map[string]any, len(pm)), pm)
			continue
		}
		dst[k] = v
	}
	return dst
}

// Patch merges two JSON object documents. The hot path decodes state once and
// uses MergeMaps directly; this remains for tools/tests operating on raw JSON.
func Patch(original json.RawMessage, patch json.RawMessage) (json.RawMessage, error) {
	var a, b map[string]any
	if err := json.Unmarshal(original, &a); err != nil {
		return nil, fmt.Errorf("unmarshal original JSON: %w", err)
	}
	if err := json.Unmarshal(patch, &b); err != nil {
		return nil, fmt.Errorf("unmarshal patch JSON: %w", err)
	}
	return json.Marshal(MergeMaps(a, b))
}
