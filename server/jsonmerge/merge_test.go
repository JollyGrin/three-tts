package jsonmerge_test

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/jollygrin/tts-server/jsonmerge"
	"github.com/stretchr/testify/require"
)

func TestPatch(t *testing.T) {
	a := `{"a": {"a": 1, "b": 3, "c": 4}}`
	b := `{"a": {"a": null, "b": 2}}`

	merged, err := jsonmerge.Patch(json.RawMessage(a), json.RawMessage(b))
	require.NoError(t, err)
	fmt.Println(string(merged))
	//require.JSONEq(t, `{"a":{"a":1,"b":2,"c":4}}`, string(merged))
}
