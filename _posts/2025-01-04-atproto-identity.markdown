---
layout: post
title:  "Identities in the AT Protocol"
date:   2025-01-04
categories: [atproto,bluesky,did,plc]
---

The AT Protocol is an open, decentralized network for building social applications.

Bluesky, a relatively new social network, is built on top of the AT Protocol.
It recently piqued my interest as I came across this fascinating research paper [Bluesky and the AT Protocol: Usable Decentralized Social Media](https://arxiv.org/abs/2402.03239).

In this post, we’ll dive into one of the key elements of the AT Protocol: **identities**.
We will start with Bluesky user handles, explore additional information about them, and see what else we can discover.

### DID Resolution

A handle in Bluesky is associated with a DID, which can be resolved using DNS or HTTPS.

> **decentralized identifier (DID)**
> 
> A globally unique persistent identifier that does not require a centralized registration authority and is often generated and/or registered cryptographically. \[...]
> Many—but not all—DID methods make use of distributed ledger technology (DLT) or some other form of decentralized network.
> 
> _From [Decentralized Identifiers (DIDs) v1.0](https://www.w3.org/TR/did-core/#dfn-decentralized-identifiers)_


The DID for `@jay.bsky.team` can be resolved via a DNS record.
Example with `dig`:

```bash
> dig _atproto.jay.bsky.team TXT
[...]
_atproto.jay.bsky.team. 14400 IN TXT "did=did:plc:oky5czdrnfjpqslsw2a5iclo"
```

If you don't have `dig` installed, try an online tool like [nslookup.io](https://www.nslookup.io/domains/_atproto.jay.bsky.team/dns-records/txt/).

If no DNS TXT entry exists, the handle may resolve to a DID through a well-known HTTPS endpoint.
Let's take the example of `@jamesgunn.bsky.social`:

```bash
> curl https://jamesgunn.bsky.social/.well-known/atproto-did
did:plc:lotavzt36yanhfy3j3gpysyj
```

If you don't have `curl` installed, you can just open the link in your browser [https://jamesgunn.bsky.social/.well-known/atproto-did](https://jamesgunn.bsky.social/.well-known/atproto-did).

### PLC

Once you have a DID, examine the part after the first colon.
This is known as the method.
The above two examples use `plc`, which stands for Public Ledger of Credentials.
These PLC DIDs can be looked up in the PLC directory at [plc.directory](https://plc.directory).

_The AT Protocol also supports the `web` method, though we focus on `plc` here._

We can use `curl` again to get more information about a DID.
Let's take `@jay.bsky.team`'s DID as example.

```bash
> curl https://plc.directory/did:plc:oky5czdrnfjpqslsw2a5iclo/log | jq
[
  {
    "sig": "KuN3A61golVNSDU71wZKLP9lVuXk6YekJAz1lwDzrPsNTEWHBBW_8zSyV6pDxV4KiYXuAXlS1Ik47XkjQZ94mA",
    "prev": null,
    "type": "create",
    "handle": "jay.bsky.social",
    "service": "https://bsky.social",
    "signingKey": "did:key:zQ3shP5TBe1sQfSttXty15FAEHV1DZgcxRZNxvEWnPfLFwLxJ",
    "recoveryKey": "did:key:zQ3shhCGUqDKjStzuDxPkTxN6ujddP4RkEKJJouJGRRkaLGbg"
  },
  {
    "sig": "TY3ot8yFF-0LL8ceoRwSGaNQj0F1aj-IApYXRGT21G1fnznKHUHT1QE7c1aTrYd9PQLVvXUGag6CZ9EEeIKqgA",
    "prev": "bafyreidswhiwi4ljkl4es4vwqhkas3spmmktortqbp6lkrb5v7qqdfr3mm",
    "type": "plc_operation",
    "services": {
      "atproto_pds": {
        "type": "AtprotoPersonalDataServer",
        "endpoint": "https://bsky.social"
      }
    },
    "alsoKnownAs": [
      "at://jay.bsky.social"
    ],
    "rotationKeys": [
      "did:key:zQ3shhCGUqDKjStzuDxPkTxN6ujddP4RkEKJJouJGRRkaLGbg",
      "did:key:zQ3shpKnbdPx3g3CmPf5cRVTPe1HtSwVn5ish3wSnDPQCbLJK"
    ],
    "verificationMethods": {
      "atproto": "did:key:zQ3shXjHeiBuRCKmM36cuYnm7YEMzhGnCmCyW92sRJ9pribSF"
    }
  },
  {
    "sig": "WmQmobHA6abtu8xIkBSrDkkoMNjOxP1Tl_1zl1DbIZlA9kjOyxjX-J1rzwWVy3stdzMowpBeBnedkAug84n_RQ",
    "prev": "bafyreicgb25yf5fro22oyhtkbgerzr4nume4sx757r525skxdzpeoeseha",
    "type": "plc_operation",
    "services": {
      "atproto_pds": {
        "type": "AtprotoPersonalDataServer",
        "endpoint": "https://bsky.social"
      }
    },
    "alsoKnownAs": [
      "at://jay.bsky.team"
    ],
    "rotationKeys": [
      "did:key:zQ3shhCGUqDKjStzuDxPkTxN6ujddP4RkEKJJouJGRRkaLGbg",
      "did:key:zQ3shpKnbdPx3g3CmPf5cRVTPe1HtSwVn5ish3wSnDPQCbLJK"
    ],
    "verificationMethods": {
      "atproto": "did:key:zQ3shXjHeiBuRCKmM36cuYnm7YEMzhGnCmCyW92sRJ9pribSF"
    }
  },
  {
    "sig": "dhstt4uPua8OVs8TVzHTqtCnNMsBDN7kjxIBmTIYBDRkknrtprBJ_AISXFoBZyqfoxq2altp-vlRAPEKSh5zeg",
    "prev": "bafyreihmf7dapx27fexc7jwj4cdpbxcmhnnwo3x5vrpvbr6lclzj7gpsmi",
    "type": "plc_operation",
    "services": {
      "atproto_pds": {
        "type": "AtprotoPersonalDataServer",
        "endpoint": "https://morel.us-east.host.bsky.network"
      }
    },
    "alsoKnownAs": [
      "at://jay.bsky.team"
    ],
    "rotationKeys": [
      "did:key:zQ3shhCGUqDKjStzuDxPkTxN6ujddP4RkEKJJouJGRRkaLGbg",
      "did:key:zQ3shpKnbdPx3g3CmPf5cRVTPe1HtSwVn5ish3wSnDPQCbLJK"
    ],
    "verificationMethods": {
      "atproto": "did:key:zQ3shtJpFGgEG3tv3ERKvjo7VHbjDPVyvjYvW7gpie49rtNtc"
    }
  }
]
```

Again, feel free to click on it instead, [https://plc.directory/did:plc:oky5czdrnfjpqslsw2a5iclo/log](https://plc.directory/did:plc:oky5czdrnfjpqslsw2a5iclo/log).

This returns a list of all operations that were performed on this DID.
The first entry is the genesis operation — the one that created the DID.
It is the only one where `prev` (previous entry) is `null`, because it is the first one.

Note that the first entry of this DID's log has a different format.
This entry uses the legacy format.
Currently, newly created DIDs use the new format (subsequent records), but `@jay.bsky.team` has been around for a while (the account belongs to Bluesky's CEO).

If you look through the logs you will notice a couple of changes that were made to her identity over time:

- the handle was changed from `jay.bsky.social` to `jay.bsky.team` (note that the legacy format used `handle` whereas the new format uses `alsoKnownAs`)
  - the handle now includes `at://`
- the personal data server changed from `https://bsky.social` to `https://morel.us-east.host.bsky.network`

### Signatures

Each entry in the log includes a `sig` field, which contains the signature.
This cryptographic signature is derived from the other fields in the entry.
For the genesis operation, the `rotationKeys` (or `signingKey` for legacy) field contains the public key(s) of the key pair(s) with which the entry was signed.

Subsequent operations need to be signed with the key from the previous entry.
Additionally, the `prev` field references the previous entry.

### Creating a DID

The identifier in the DID, which is the last part of the colon-separated string, is constructed from the genesis operation.
For `@jay.bsky.team`:

- the identifier is `oky5czdrnfjpqslsw2a5iclo`
- the genesis operation is this JSON document:

```json
{
  "sig": "KuN3A61golVNSDU71wZKLP9lVuXk6YekJAz1lwDzrPsNTEWHBBW_8zSyV6pDxV4KiYXuAXlS1Ik47XkjQZ94mA",
  "prev": null,
  "type": "create",
  "handle": "jay.bsky.social",
  "service": "https://bsky.social",
  "signingKey": "did:key:zQ3shP5TBe1sQfSttXty15FAEHV1DZgcxRZNxvEWnPfLFwLxJ",
  "recoveryKey": "did:key:zQ3shhCGUqDKjStzuDxPkTxN6ujddP4RkEKJJouJGRRkaLGbg"
}
```

Steps:

- encode the genesis operation in DAG-CBOR (this is a concise binary format and looks a bit like JSON)
- create a SHA256 hash of the encoded document
- encode the hash with base 32 and make its letters lowercase.
- take the first 24 characters
- add did:plc: as a prefix to create the 32-character DID

### Verification

Based on what we've learned so far we can verify a handle from Bluesky.
For example, if we want to check `@jay.bsky.team`:

- resolve DID via DNS: `did:plc:oky5czdrnfjpqslsw2a5iclo`
- look up DID in PLC directory
- the handle in the `alsoKnownAs` (or `handle` for legacy) field must match `jay.bsky.team`
- verify all operations using the public keys and signatures
- reconstruct the DID from the genesis operation and ensure it is the same as the one we found in the DNS TXT record

Can we trust the PLC directory though?
Say a malicious actor has taken over control and modified all entries in the log.
The hacker even constructed the entries in the log so that all the signatures appear valid.
How would we know the PLC directory is compromised?
Remember that the DID can be reconstructed from the genesis operation.
If that were modified, we'd end up with a different DID from the one we found in the DNS TXT record.

## Links & Further Reading

- [Bluesky Application](https://bsky.app)
- [AT Protocol](https://atproto.com)
  - [AT Protocol Identity](https://atproto.com/guides/identity)
  - [AT Protocol DID](https://atproto.com/specs/did)
  - [AT Protocol Handle](https://atproto.com/specs/handle)
- [Decentralized Identifiers (DIDs) v1.0](https://www.w3.org/TR/did-core)
- [`did:plc` Method Specification](https://web.plc.directory/spec/v0.1/did-plc)
- [Specification: DAG-CBOR](https://ipld.io/specs/codecs/dag-cbor/spec/)
