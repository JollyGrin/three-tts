package jsonmerge

import (
	"encoding/json"
	"fmt"

	"github.com/zclconf/go-cty/cty"
	ctyjson "github.com/zclconf/go-cty/cty/json"
)

func Patch(original json.RawMessage, patch json.RawMessage) (json.RawMessage, error) {
	a, err := unmarshal(original)
	if err != nil {
		return nil, fmt.Errorf("unmarshal original JSON: %w", err)
	}

	b, err := unmarshal(patch)
	if err != nil {
		return nil, fmt.Errorf("unmarshal patch JSON: %w", err)
	}

	// Merge the two cty values
	merged := mergeObjects(a, b)
	return ctyjson.Marshal(merged, merged.Type())
}

func unmarshal(data json.RawMessage) (cty.Value, error) {
	implType, err := ctyjson.ImpliedType(data)
	if err != nil {
		return cty.NilVal, fmt.Errorf("type error: %w", err)
	}

	return ctyjson.Unmarshal(data, implType)
}

func mergeObjects(a, b cty.Value) cty.Value {
	output := make(map[string]cty.Value)

	for key, val := range a.AsValueMap() {
		output[key] = val
	}
	b.ForEachElement(func(key, val cty.Value) (stop bool) {
		k := key.AsString()
		old := output[k]
		if old.IsKnown() && isNotEmptyObject(old) && isNotEmptyObject(val) {
			output[k] = mergeObjects(old, val)
		} else {
			output[k] = val
			if val.IsNull() {
				delete(output, k)
			}
		}

		return false
	})
	return cty.ObjectVal(output)
}

func isNotEmptyObject(val cty.Value) bool {
	return !val.IsNull() && val.IsKnown() && val.Type().IsObjectType() && val.LengthInt() > 0
}
