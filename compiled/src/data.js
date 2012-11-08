(function() {
  var Data, DataProcess, backendProcess, calculateMeta, extractDataSpec, filterFactory, filters, frontendProcess, poly, statisticFactory, statistics, transformFactory, transforms,
    __indexOf = Array.prototype.indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  poly = this.poly || {};

  /*
  # GLOBALS
  */

  Data = (function() {

    function Data(params) {
      this.url = params.url, this.json = params.json;
      this.frontEnd = !this.url;
    }

    return Data;

  })();

  poly.Data = Data;

  DataProcess = (function() {

    function DataProcess(layerSpec, strictmode) {
      this.dataObj = layerSpec.data;
      this.dataSpec = extractDataSpec(layerSpec);
      this.strictmode = strictmode;
      this.statData = null;
      this.metaData = {};
    }

    DataProcess.prototype.process = function(callback) {
      var wrappedCallback,
        _this = this;
      wrappedCallback = function(data, metaData) {
        _this.statData = data;
        _this.metaData = metaData;
        return callback(_this.statData, _this.metaData);
      };
      if (this.dataObj.frontEnd) {
        if (this.strictmode) {} else {
          return frontendProcess(this.dataSpec, this.dataObj.json, wrappedCallback);
        }
      } else {
        if (this.strictmode) {
          return console.log('wtf, cant use strict mode here');
        } else {
          return backendProcess(this.dataSpec, this.dataObj, wrappedCallback);
        }
      }
    };

    DataProcess.prototype.reprocess = function(newlayerSpec, callback) {
      var newDataSpec;
      newDataSpec = extractDataSpec(newlayerSpec);
      if (_.isEqual(this.dataSpec, newDataSpec)) {
        callback(this.statData, this.metaData);
      }
      this.dataSpec = newDataSpec;
      return this.process(callback);
    };

    return DataProcess;

  })();

  poly.DataProcess = DataProcess;

  poly.data = {};

  poly.data.process = function(dataObj, layerSpec, strictmode, callback) {
    var d;
    d = new DataProcess(layerSpec, strictmode);
    d.process(callback);
    return d;
  };

  /*
  # TRANSFORMS
  */

  transforms = {
    'bin': function(key, transSpec) {
      var binFn, binwidth, name;
      name = transSpec.name, binwidth = transSpec.binwidth;
      if (_.isNumber(binwidth)) {
        binFn = function(item) {
          return item[name] = binwidth * Math.floor(item[key] / binwidth);
        };
        return {
          trans: binFn,
          meta: {
            bw: binwidth,
            binned: true
          }
        };
      }
    },
    'lag': function(key, transSpec) {
      var i, lag, lagFn, lastn, name;
      name = transSpec.name, lag = transSpec.lag;
      lastn = (function() {
        var _results;
        _results = [];
        for (i = 1; 1 <= lag ? i <= lag : i >= lag; 1 <= lag ? i++ : i--) {
          _results.push(void 0);
        }
        return _results;
      })();
      lagFn = function(item) {
        lastn.push(item[key]);
        return item[name] = lastn.shift();
      };
      return {
        trans: lagFn,
        meta: void 0
      };
    }
  };

  transformFactory = function(key, transSpec) {
    return transforms[transSpec.trans](key, transSpec);
  };

  /*
  # FILTERS
  */

  filters = {
    'lt': function(x, value) {
      return x < value;
    },
    'le': function(x, value) {
      return x <= value;
    },
    'gt': function(x, value) {
      return x > value;
    },
    'ge': function(x, value) {
      return x >= value;
    },
    'in': function(x, value) {
      return __indexOf.call(value, x) >= 0;
    }
  };

  filterFactory = function(filterSpec) {
    var filterFuncs;
    filterFuncs = [];
    _.each(filterSpec, function(spec, key) {
      return _.each(spec, function(value, predicate) {
        var filter;
        filter = function(item) {
          return filters[predicate](item[key], value);
        };
        return filterFuncs.push(filter);
      });
    });
    return function(item) {
      var f, _i, _len;
      for (_i = 0, _len = filterFuncs.length; _i < _len; _i++) {
        f = filterFuncs[_i];
        if (!f(item)) return false;
      }
      return true;
    };
  };

  /*
  # STATS
  */

  statistics = {
    sum: function(spec) {
      return function(values) {
        return _.reduce(values, (function(v, m) {
          return v + m;
        }), 0);
      };
    },
    count: function(spec) {
      return function(values) {
        return values.length;
      };
    },
    uniq: function(spec) {
      return function(values) {
        return (_.uniq(values)).length;
      };
    }
  };

  statisticFactory = function(statSpecs) {
    var group, statFuncs;
    group = statSpecs.group;
    statFuncs = {};
    _.each(statSpecs.stats, function(statSpec) {
      var key, name, stat, statFn;
      stat = statSpec.stat, key = statSpec.key, name = statSpec.name;
      statFn = statistics[stat](statSpec);
      return statFuncs[name] = function(data) {
        return statFn(_.pluck(data, key));
      };
    });
    return function(data) {
      var rep;
      rep = {};
      _.each(group, function(g) {
        return rep[g] = data[0][g];
      });
      _.each(statFuncs, function(stats, name) {
        return rep[name] = stats(data);
      });
      return rep;
    };
  };

  /*
  # META
  */

  calculateMeta = function(key, metaSpec, data) {
    var asc, comparator, groupedData, limit, multiplier, sort, stat, statSpec, values;
    sort = metaSpec.sort, stat = metaSpec.stat, limit = metaSpec.limit, asc = metaSpec.asc;
    if (stat) {
      statSpec = {
        stats: [stat],
        group: [key]
      };
      groupedData = poly.groupBy(data, statSpec.group);
      data = _.map(groupedData, statisticFactory(statSpec));
    }
    multiplier = asc ? 1 : -1;
    comparator = function(a, b) {
      if (a[sort] === b[sort]) return 0;
      if (a[sort] >= b[sort]) return 1 * multiplier;
      return -1 * multiplier;
    };
    data.sort(comparator);
    if (limit) data = data.slice(0, (limit - 1) + 1 || 9e9);
    values = _.uniq(_.pluck(data, key));
    return {
      meta: {
        levels: values,
        sorted: true
      },
      filter: {
        "in": values
      }
    };
  };

  /*
  # GENERAL PROCESSING
  */

  extractDataSpec = function(layerSpec) {
    return {};
  };

  frontendProcess = function(dataSpec, rawData, callback) {
    var addMeta, additionalFilter, data, groupedData, metaData;
    data = _.clone(rawData);
    metaData = {};
    addMeta = function(key, meta) {
      if (metaData[key] == null) metaData[key] = {};
      return _.extend(metaData[key], meta);
    };
    if (dataSpec.trans) {
      _.each(dataSpec.trans, function(transSpec, key) {
        var meta, trans, _ref;
        _ref = transformFactory(key, transSpec), trans = _ref.trans, meta = _ref.meta;
        _.each(data, function(d) {
          return trans(d);
        });
        return addMeta(transSpec.name, meta);
      });
    }
    if (dataSpec.filter) data = _.filter(data, filterFactory(dataSpec.filter));
    if (dataSpec.meta) {
      additionalFilter = {};
      _.each(dataSpec.meta, function(metaSpec, key) {
        var filter, meta, _ref;
        _ref = calculateMeta(key, metaSpec, data), meta = _ref.meta, filter = _ref.filter;
        additionalFilter[key] = filter;
        return addMeta(key, meta);
      });
      data = _.filter(data, filterFactory(additionalFilter));
    }
    if (dataSpec.stats) {
      groupedData = poly.groupBy(data, dataSpec.stats.group);
      data = _.map(groupedData, statisticFactory(dataSpec.stats));
    }
    return callback(data, metaData);
  };

  backendProcess = function(dataSpec, rawData, callback) {
    return console.log('backendProcess');
  };

  /*
  # DEBUG
  */

  poly.data.frontendProcess = frontendProcess;

  /*
  # EXPORT
  */

  this.poly = poly;

}).call(this);