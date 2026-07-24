package jsonmerge_test

import (
	"encoding/json"
	"testing"

	"github.com/jollygrin/tts-server/jsonmerge"
	"github.com/stretchr/testify/require"
)

func TestPatch(t *testing.T) {
	a := `{"a": {"a": 1, "b": 3, "c": 4}}`
	b := `{"a": {"a": null, "b": 2}}`

	merged, err := jsonmerge.Patch(json.RawMessage(a), json.RawMessage(b))
	require.NoError(t, err)
	require.JSONEq(t, `{"a":{"b":2,"c":4}}`, string(merged))
}

// semantics must match the client store merge: objects merge recursively,
// null deletes, arrays/scalars replace, empty patch object keeps the old value
func TestPatchClientSemantics(t *testing.T) {
	cases := []struct{ name, a, b, want string }{
		{
			name: "null deletes an entity",
			a:    `{"cards":{"c1":{"position":[1,2,3]},"c2":{"position":[4,5,6]}}}`,
			b:    `{"cards":{"c1":null}}`,
			want: `{"cards":{"c2":{"position":[4,5,6]}}}`,
		},
		{
			name: "arrays replace, never merge",
			a:    `{"decks":{"d1":{"cards":[{"id":"a"},{"id":"b"}]}}}`,
			b:    `{"decks":{"d1":{"cards":[{"id":"a"}]}}}`,
			want: `{"decks":{"d1":{"cards":[{"id":"a"}]}}}`,
		},
		{
			name: "partial update keeps sibling fields",
			a:    `{"cards":{"c1":{"position":[1,2,3],"faceImageUrl":"x"}}}`,
			b:    `{"cards":{"c1":{"position":[7,8,9]}}}`,
			want: `{"cards":{"c1":{"position":[7,8,9],"faceImageUrl":"x"}}}`,
		},
		{
			name: "empty patch object keeps existing value",
			a:    `{"players":{"p1":{"seat":1}}}`,
			b:    `{"players":{"p1":{}}}`,
			want: `{"players":{"p1":{"seat":1}}}`,
		},
		{
			name: "delete and re-add different keys in one patch",
			a:    `{"cards":{"old":{"position":[0,0,0]}}}`,
			b:    `{"cards":{"old":null,"new":{"position":[1,1,1]}}}`,
			want: `{"cards":{"new":{"position":[1,1,1]}}}`,
		},
		{
			name: "nested nulls in a fresh subtree are stripped",
			a:    `{}`,
			b:    `{"players":{"p1":{"tray":{"ghost":null,"kept":{"faceImageUrl":"y"}}}}}`,
			want: `{"players":{"p1":{"tray":{"kept":{"faceImageUrl":"y"}}}}}`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			merged, err := jsonmerge.Patch(json.RawMessage(tc.a), json.RawMessage(tc.b))
			require.NoError(t, err)
			require.JSONEq(t, tc.want, string(merged))
		})
	}
}
