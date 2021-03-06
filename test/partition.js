const dt = require('..')
const hyperdrive = require('hyperdrive')
const memdb = require('memdb')
const tape = require('tape')
const fs = require('fs')

var drive = hyperdrive(memdb())
var source = drive.createArchive()

fs.createReadStream('test/test.csv').pipe(source.createFileWriteStream('test.csv'))
fs.createReadStream('test/test2.csv').pipe(source.createFileWriteStream('test2.csv'))

source.finalize(() => {
  var drive2 = hyperdrive(memdb())
  var peer = drive2.createArchive(source.key, {sparse: true})
  replicate(source, peer)

  var result = dt.RDD(peer)
    .csv()
    .map(row => parseInt(row['value'], 10))

  tape('partition', function (t) {
    var newArchive = drive2.createArchive()
    result
      .map(x => [x % 2, x])
      .partitionByKey(newArchive).then(next => {
      next
        .collect()
        .toArray(x => {
          t.same(x.map(b => b.toString()), ['1\n3\n5\n7\n9\n', '2\n4\n6\n8\n10\n'])
          t.end()
        })
    })
  })

  tape('get', function (t) {
    var newArchive = drive2.createArchive()
    result
      .map(x => [x % 2, x])
      .partitionByKey(newArchive).then(next => {
      next
        .get('0')
        .collect()
        .toArray(x => {
          t.same(x.map(b => b.toString()), ['2\n4\n6\n8\n10\n'])
          t.end()
        })
    })
  })

  tape('select', function (t) {
    var newArchive = drive2.createArchive()
    result
      .map(x => [x % 3, x])
      .partitionByKey(newArchive).then(next => {
      next
        .select(x => parseInt(x.name) < 2) // x % 3 < 2
        .collect()
        .toArray(x => {
          t.same(x.map(b => b.toString()), ['1\n4\n7\n10\n', '3\n6\n9\n'])
          t.end()
        })
    })
  })

  tape('get only works on RDD before transform', function (t) {
    t.throws(() => {
      result.get('test.csv')
    })
    t.end()
  })

  tape('select only works on RDD before transform', function (t) {
    t.throws(() => {
      result.select(x => x.name === 'test.csv')
    })
    t.end()
  })
})

function replicate (a, b) {
  var stream = a.replicate()
  stream.pipe(b.replicate()).pipe(stream)
}

