// CASTV2 wire format.
//
// Google Cast devices speak a protobuf-framed protocol over TLS on port 8009.
// Each frame is a 4-byte big-endian length followed by a serialized CastMessage.
//
// We define the schema here rather than depending on the `castv2` package,
// which was last published in 2022 and only knows how to talk to the Default
// Media Receiver (which cannot play YouTube content). protobufjs is current
// and does the encoding; the framing is ours.

import protobuf from 'protobufjs'

const CAST_MESSAGE_PROTO = `
syntax = "proto2";
message CastMessage {
  enum ProtocolVersion { CASTV2_1_0 = 0; }
  required ProtocolVersion protocol_version = 1 [default = CASTV2_1_0];
  required string source_id = 2;
  required string destination_id = 3;
  required string namespace = 4;
  enum PayloadType { STRING = 0; BINARY = 1; }
  required PayloadType payload_type = 5;
  optional string payload_utf8 = 6;
  optional bytes payload_binary = 7;
}
`

const CastMessage = protobuf.parse(CAST_MESSAGE_PROTO).root.lookupType('CastMessage')

export interface CastFrame {
  sourceId: string
  destinationId: string
  namespace: string
  payload: string
}

export function encodeFrame(frame: CastFrame): Buffer {
  const message = CastMessage.create({
    protocol_version: 0,
    source_id: frame.sourceId,
    destination_id: frame.destinationId,
    namespace: frame.namespace,
    payload_type: 0,
    payload_utf8: frame.payload,
  })
  const body = Buffer.from(CastMessage.encode(message).finish())
  const header = Buffer.allocUnsafe(4)
  header.writeUInt32BE(body.length, 0)
  return Buffer.concat([header, body])
}

/**
 * Incremental frame reader. TLS gives us an arbitrary byte stream, so frames
 * arrive split across chunks or several to a chunk; this buffers until whole
 * frames are available.
 */
export class FrameReader {
  private buffer: Buffer = Buffer.alloc(0)

  push(chunk: Buffer): CastFrame[] {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const frames: CastFrame[] = []

    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32BE(0)
      if (this.buffer.length < 4 + length) break

      const body = this.buffer.subarray(4, 4 + length)
      this.buffer = this.buffer.subarray(4 + length)

      try {
        const decoded = CastMessage.decode(body) as unknown as {
          source_id: string
          destination_id: string
          namespace: string
          payload_utf8?: string
        }
        frames.push({
          sourceId: decoded.source_id,
          destinationId: decoded.destination_id,
          namespace: decoded.namespace,
          payload: decoded.payload_utf8 ?? '',
        })
      } catch {
        // A frame we can't decode is not worth killing the connection over —
        // skip it and keep reading. Binary-payload frames land here.
      }
    }

    return frames
  }

  reset() {
    this.buffer = Buffer.alloc(0)
  }
}
