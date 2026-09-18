// RemoteFileTransfer.ts — PORT interface (application layer owns this)

/** Request to upload a local file to a remote path. */
export interface RemoteUploadRequest {
  readonly localPath: string;
  readonly remotePath: string;
}

/** Request to download a remote file to a local path. */
export interface RemoteDownloadRequest {
  readonly remotePath: string;
  readonly localPath: string;
}

/** Outcome of a checksum-verified transfer. */
export interface RemoteTransferResult {
  readonly bytes: number;
  /** sha256 hex digest of the transferred bytes, verified on both ends. */
  readonly sha256: string;
}

/** Raised when transferred bytes fail the checksum comparison or verification itself fails. */
export class TransferIntegrityError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TransferIntegrityError';
  }
}

/**
 * Port: upload/download files with an integrity check on the transferred
 * bytes — the remote file's sha256 is compared against the local file's
 * checksum. Download is unused by v0 flows but is part of the port contract.
 */
export interface RemoteFileTransfer {
  upload(request: RemoteUploadRequest): Promise<RemoteTransferResult>;
  download(request: RemoteDownloadRequest): Promise<RemoteTransferResult>;
}
