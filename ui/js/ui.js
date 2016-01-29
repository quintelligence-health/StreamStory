function changeControlVal(stateId, ftrIdx, val) {
	var data = { ftrIdx: ftrIdx, val: val };
	if (stateId != null) data.stateId = stateId;
	
	$.ajax('api/setControl', {
		dataType: 'json',
		data: data,
		method: 'POST',
		success: function (data) {
			viz.setModel(data);
		},
		error: handleAjaxError()
	});
}

(function () {
	var TAB_ID = null;
	var MODE_SELECT_ACTIVITY_STATE = false;
	var ui;
	var viz;
	var act;

	//=======================================================
	// WEB SOCKETS
	//=======================================================
	
	(function () {
		function initWebSockets() {
			var nNotifications = 0;
			var msgQ = [];
			
			function drawMsg(msg, handler) {
				$('#list-msg').append('<li class="list-group-item li-msg">' + msg + '</li>');
				if (handler != null) {
					$('#list-msg li').last().addClass('clickable');
					$('#list-msg li').last().click(handler);
				}
				
				msgQ.push(msg);
				while (msgQ.length > 2)
					msgQ.shift();
				
				$('#span-num-msgs').html(++nNotifications + '');
							
				for (var i = 0; i < msgQ.length; i++) {
					var id = 'div-msg-' + i;
					$('#' + id).alert('close');
					
					var wrapper = $('#div-msg-' + i + '-wrapper');
					var alertDiv = $('<div />').appendTo(wrapper);
					
					alertDiv.addClass('alert');
					alertDiv.addClass('alert-info');
					alertDiv.addClass('alert-dismissible');
					alertDiv.attr('role', 'alert');
					alertDiv.attr('id', id);
					alertDiv.html(msgQ[i]);
				}
			}
			
			function getMsgContent(header, contentVals) {
				var drawStr = '<h5>' + header + '</h5>';
				drawStr += '<p>';
				
				var contentKeys = [];
				for (var key in contentVals) {
					contentKeys.push(key);
				}
				
				for (var i = 0; i < contentKeys.length; i++) {
					var contentKey = contentKeys[i];
					var contentVal = contentVals[contentKey];
					
					if (isNumber(contentVal))
						contentVal = toUiPrecision(parseFloat(contentVal));
					
					if (contentVal != null && typeof contentVal == 'object') {
						var keys = [];
						for (var key in contentVal) {
							keys.push(key);
						}
						
						for (var j = 0; j < keys.length; j++) {
							var val = contentVal[keys[j]];
							if (!isNaN(val))
								val = toUiPrecision(parseFloat(val))
							drawStr += keys[j] + ': ' + val;
							if (j < keys.length - 1)
								drawStr += ', ';
						}	
					} else {
						if (contentKey == 'time' || contentKey == 'start' || contentKey == 'end') {
							contentVal = formatDateTime(new Date(parseInt(contentVal)));
						}
						drawStr += contentKey + ': ' + contentVal;
					}
					
					if (i < contentKeys.length - 1) {
						drawStr += '<br />';
					}
				}
				
				drawStr += '</p>';
				
				return drawStr;
			}
			
			function getWsUrl() {
				var result;
				var loc = window.location;
				
				if (loc.protocol === "https:") {
				    result = "wss:";
				} else {
				    result = "ws:";
				}
				
				var path = loc.pathname;
				path = path.substring(0, path.lastIndexOf('/')) + '/ws';
				
				result += "//" + loc.host + path;
				return result;
			}
			
			function initWs() {
				var address = getWsUrl();
				
				var isDrawing = false;
				
				console.log('Connecting websocket to address: ' + address); 
				var ws = new WebSocket(address);
				
				ws.onopen = function () {
		   			console.log('Web socket connected!');
				};
				
				ws.onerror = function (e) {
					console.log('Web socket error: ' + e.message);
					alert('Web socket error!');
				};
				
				ws.onmessage = function (msgStr) {
					var msg = JSON.parse(msgStr.data);
					
					if (msg.type == 'stateChanged')
						viz.setCurrentStates(msg.content);
					else if (msg.type == 'anomaly') {
						drawMsg(msg.content);
					}
					else if (msg.type == 'outlier') {
						drawMsg('Outlier: ' + JSON.stringify(msg.content));
					}
					else if (msg.type == 'prediction') {
						drawMsg(getMsgContent('Prediction', msg.content));
					}
					else if (msg.type == 'activity') {
						drawMsg(getMsgContent('Activity', msg.content));
					}
					else if (msg.type == 'coeff') {
						drawMsg(getMsgContent('Coefficient', msg.content));
					}
					else if (msg.type == 'values') {
						var content = msg.content;
						
						var thumbs = $('#div-values-wrapper').children();
						
						var maxThumbs = 6;
						
						var txt = '';
						for (var key in content) {
							txt += key + ': ' + toUiPrecision(content[key]) + '<br />';
						}
						
						var thumb = $($('#thumbnail-online-vals').html());
						thumb.find('.txt-wrapper').html(txt);
	
						if (thumbs.length >= maxThumbs) {
							if (!isDrawing) {
								isDrawing = true;
								var first = thumbs.first();
								first.width(first.width()-1);	// hack to avoid a blink
								thumbs.first().hide({
									duration: 100,
									easing: 'linear',
									start: function () {
										console.log('started');
									},
									complete: function () {
										$(this).remove();
										thumbs.last().find('.thumbnail').removeClass('values-current');
										$('#div-values-wrapper').append(thumb);
										$('#div-values-wrapper').children().last().find('.thumbnail').addClass('values-current')
										isDrawing = false;
									}
								});//.remove();
							}
						} else {
							thumbs.last().find('.thumbnail').removeClass('values-current');
							$('#div-values-wrapper').append(thumb);
							$('#div-values-wrapper').children().last().find('.thumbnail').addClass('values-current')
						}
					}
					else if (msg.type == 'statePrediction') {
						var content = msg.content;
						var eventId = content.eventId;
						var msgStr = 'Undesired event prediction: ' + eventId + ', prob: ' + content.probability.toFixed(2);
						drawMsg(msgStr, function (event) {
							// draw a histogram of the PDF
							var timeV = content.pdf.timeV;
							var probV = content.pdf.probV;
							
							var data = [];
							for (var i = 0; i < timeV.length; i++) {
								data.push([timeV[i], probV[i]]);
							}
							
							var min = timeV[0];
							var max = timeV[timeV.length-1];
							
							$('#popover-pdf-hist').slideDown();
							
							var chart = new Highcharts.Chart({
							    chart: {
							        renderTo: document.getElementById('hist-pdf'),
							        type: 'line'
							    },
							    title: {
						        	floating: true,
						        	text: ''
						        },
						        legend: {
						        	enabled: false
						        },
							    yAxis: {
							    	title: {
							    		enabled: false
							    	},
							    	min: 0,
							    	max: 1
							    },
							    plotOptions: {
							        column: {
							            groupPadding: 0,
							            pointPadding: 0,
							            borderWidth: 0
							        }
							    },
							    series: [{
							    	name: 'PDF',
							        data: data
							    }]
							});
						});
					}
				};
			}
			
			initWs();
		}
		
		$(document).ready(function () {
			if (IS_MODEL_ACTIVE) {
				initWebSockets();
			}
		});
	})();
	
	//=======================================================
	// MAIN USER INTERFACE
	//=======================================================
	
	(function () {
		UI = function (opts) {
			var featureInfo = null;
			
			function privateFetchHistogram(opts) {
				var container = opts.insertDiv != null ? opts.insertDiv : 'hist-wrapper';
				
				if (opts.type == 'state') {
					if (opts.openWindow)
						window.open('popups/histogram.html?s=' + opts.stateId + '&f=' + opts.ftrId);
					else {
						$.ajax('api/histogram', {
							dataType: 'json',
							data: { stateId: opts.stateId, feature: opts.ftrId },
							success: function (hist) {
								drawHistogram({
									data: hist,
									container: container,
									showY: opts.showY
								});
							},
							error: handleAjaxError()
						});
					}
				} else {	// transition
					$.ajax('api/transitionHistogram', {
						dataType: 'json',
						data: { sourceId: opts.sourceId, targetId: opts.targetId, feature: opts.ftrId },
						success: function (hist) {
							drawHistogram({
								data: hist,
								container: container,
								showY: opts.showY
							});
						},
						error: handleAjaxError()
					});
				}
			}
			
			var that = {
				fetchHistogram: function (stateId, ftrId, openWindow, insertDiv, showY) {
					privateFetchHistogram({ 
						type: 'state',
						stateId: stateId,
						ftrId: ftrId,
						insertDiv: insertDiv,
						openWindow: openWindow,
						showY: showY
					});
				},
				fetchTransitionHistogram: function (sourceId, targetId, ftrId, insertDiv) {
					privateFetchHistogram({
						type: 'transition',
						sourceId: sourceId,
						targetId: targetId,
						ftrId: ftrId,
						insertDiv: insertDiv,
						openWindow: false
					});
				},
				createThumbnail: function (opts) {
					var thumbnail = $('#div-thumbnail').find('.thumb-col').clone();
					var valField = thumbnail.find('.attr-val');
					
					thumbnail.find('.attr-name').html(opts.name);
					thumbnail.find('.container-hist').attr('id', opts.histogramContainer);
					
					if (opts.value != null)
						valField.html(opts.value.toPrecision(3));
					if (opts.valueColor != null) 
						thumbnail.find('.attr-val').css('color', opts.valueColor);
					if (opts.isLeaf) {
						thumbnail.find('.div-ftr-range').show();
						
						var range = thumbnail.find('.range-contr-val');
						range.attr('id', 'range-contr-' + opts.ftrId);
						
						range.slider({
							value: opts.value,
							min: opts.min,
							max: opts.max,
							step: (opts.max - opts.min) / 100,
							animate: true,
							change: function (event, ui) {
								var val = ui.value;
								
								$.ajax('api/setControl', {
									dataType: 'json',
									method: 'POST',
									data: { stateId: opts.stateId, ftrIdx: opts.ftrId, val: val },
									success: function (data) {
										$('#btn-reset-sim').removeClass('hidden');
										viz.setModel(data);
										valField.html(parseFloat(val).toPrecision(3));
									},
									error: handleAjaxError()
								});
							}
						});
					}
					
					return thumbnail;
				}
			};
					
			return that;
		}
		
		$(document).ready(function () {
			ui = UI();
		});
	})();
	
	//=======================================================
	// NAVBAR
	//=======================================================
	
	(function () {
		function postParam(paramName, paramVal) {
			$.ajax('api/param', {
				dataType: 'json',
				data: { paramName: paramName, paramVal: paramVal },
				method: 'POST',
				error: function (jqXHR, status) {
					alert('Failed to set parameter value: ' + status);
				}
			});
		}
		
		function fetchConfig() {
			$.ajax('api/config', {
				dataType: 'json',
				method: 'GET',
				data: { properties: [
					'calc_coeff',
					'deviation_extreme_lambda',
					'deviation_major_lambda',
					'deviation_minor_lambda',
					'deviation_significant_lambda'
				] },
				success: function (data) {
					var props = {};
					for (var i = 0; i < data.length; i++) {
						props[data[i].property] = data[i].value;
					}
					
					$('#check-calc-coeff').attr('checked', props.calc_coeff == 'true');
					$('#input-extreme-lambda').val(props.deviation_extreme_lambda);
					$('#input-major-lambda').val(props.deviation_major_lambda);
					$('#input-significant-lambda').val(props.deviation_significant_lambda);
					$('#input-minor-lambda').val(props.deviation_minor_lambda);
					$('#btn-fric-cancel, #btn-fric-ok').attr('disabled', 'disabled');
					
					$('#check-calc-coeff').change();
				},
				error: function (jqXHR, status) {
					alert(status);
				}
			});
			
			$.ajax('api/param', {
				dataType: 'json',
				data: { paramName: 'predictionThreshold' },
				success: function (paramObj) {
					$('#range-pred-threshold').slider("value", paramObj.value);
				},
				error: function (jqXHR, status) {
					alert(status);
				}
			});
			
			$.ajax('api/param', {
				dataType: 'json',
				data: { paramName: 'timeHorizon' },
				success: function (paramObj) {
					$('#range-time-horizon').slider("value", paramObj.value);
				},
				error: function (jqXHR, status) {
					alert(status);
				}
			});
			
			$.ajax('api/param', {
				dataType: 'json',
				data: { paramName: 'pdfBins' },
				success: function (paramObj) {
					$('#range-pdf-bins').slider("value", paramObj.value);
				},
				error: function (jqXHR, status) {
					alert(status);
				}
			});
		}
		
		$('#lnk-msgs').click(function (event) {
			event.preventDefault();
			$('#content-msgs').slideToggle();
		});
		
		$('#lnk-config').click(function (event) {
			event.preventDefault();
			$('#popup-config').modal({ show: true });
		});
		
		$('#check-calc-coeff').change(function () {
			var isChecked = $(this).is(':checked');
			if (isChecked) {
				// fetch the configuration from the db
				$('#div-configure-coeff').show();
			}
			else
				$('#div-configure-coeff').hide();
		});
		
		$('#config-done').click(function () {
			var predThreshold = $('#range-pred-threshold').slider('value');
			var timeHorizon = $('#range-time-horizon').slider('value');
			var pdfBins = $('#range-pdf-bins').slider('value');
			
			postParam('predictionThreshold', predThreshold);
			postParam('timeHorizon', timeHorizon);
			postParam('pdfBins', pdfBins);
					  			
			$.ajax('api/config', {
				method: 'POST',
				data: {
					calc_coeff: $('#check-calc-coeff').is(':checked'),
					deviation_extreme_lambda: $('#input-extreme-lambda').val(),
					deviation_major_lambda: $('#input-major-lambda').val(),
					deviation_minor_lambda: $('#input-significant-lambda').val(),
					deviation_significant_lambda: $('#input-minor-lambda').val()
				},
				error: function (jqXHR, status) {
					alert(status);
				}
			});
		});
		
		$('#config-cancel').click(function () {
			fetchConfig();
		});
		
		$('#config-cancel, #config-done').click(function () {
			$('#popup-config').modal('hide');
		});
		
		// setup the configuration sliders
		$('#range-pred-threshold').slider({
			value: PREDICTION_THRESHOLD,
			min: 0,
			max: 1,
			step: .05,
			animate: true,
			change: function (event, ui) {
				var val = ui.value;
				$('#span-pred-threshold').html(val);
			}
		});
		
		$('#range-time-horizon').slider({
			value: TIME_HORIZON,
			min: 0,
			max: 100,
			step: .1,
			animate: true,
			change: function (event, ui) {
				var val = ui.value;
				$('#span-time-horizon').html(val + ' ' + getTimeUnit() + 's');
			}
		});
		
		$('#range-pdf-bins').slider({
			value: PDF_BINS,
			min: 100,
			max: 10000,
			step: 10,
			animate: true,
			change: function (event, ui) {
				var val = ui.value;
				$('#span-pdf-bins').html(val);
			}
		});
		
		$(document).ready(function () {
			$('#popup-config').modal({ show: false });
		});
	})();
	
	//=======================================================
	// CONFIGURATION PANEL
	//=======================================================
	
	(function () {
		function resetControlVal(stateId, ftrId) {
			var data = {};
			if (stateId != null) data.stateId = stateId;
			if (ftrId != null) data.ftrIdx = ftrId;
			
			$.ajax('api/resetControl', {
				dataType: 'json',
				data: data,
				method: 'POST',
				success: function (data) {
					viz.setModel(data);
				},
				error: handleAjaxError()
			});
		}
		
		function fetchStateProbDist(time) {
			var stateId = viz.getSelectedState();
			var level = viz.getCurrentHeight();
			
			if (stateId == null) {
				alert('No state selected!');
				$('#div-future-opts').addClass('hidden');
				$('#chk-show-fut').attr('checked', false);
				$('#chk-show-fut').change();
				return false;
			}
			
			$.ajax('api/timeDist', {
				dataType: 'json',
				data: { stateId: stateId, time: time, level: level },
				success: function (data) {					
					viz.setProbDist(data);
					$('#div-fut-time').html(time);
				},
				error: handleAjaxError()
			});
		}
		
		$('#ul-ftrs-obs').find('input[type=checkbox]').change(function (event) {
			var ul = $('#ul-ftrs-obs');
			var el = $(event.target);
			var checked = el.prop('checked');
			
			if (checked) {
				// uncheck the other elements
				ul.find('input[type=checkbox]').removeAttr('checked');
				el.prop('checked', true);
				
				var ftrIdx = el.val();
				viz.setTargetFtr(ftrIdx);
			} else {
				viz.setTargetFtr(null);
			}
		});
		
		$('#chk-sim-inputs').change(function (event) {
			if (event.target.checked) {
				$('#btn-reset-sim').removeClass('hidden');
				$('#div-ftrs-control').find('.slider-contr').slider('enable');
			}
			else {
				$('#div-ftrs-control').find('.slider-contr').slider('disable');
				resetControlVal();
				$('#btn-reset-sim').addClass('hidden');
			}
		});
		
		$("#rng-time-probs").slider({
			value: 0,
			min: -10,
			max: 10,
			step: 0.01,
			disabled: true,
			animate:"slow",
			orientation: "hotizontal",
			change: function (event, ui) {
				if ($('#chk-show-fut').is(':checked')) {
					var val = ui.value;
					fetchStateProbDist(val);
				}
			},
			slide: function (event, ui) {
				$('#div-fut-time').html(ui.value);
			},
		});
		
		$('#chk-show-fut').change(function () {
			if (this.checked) {
				$('#rng-time-probs').slider('enable');
				$('#div-future-opts').removeClass('hidden');
				fetchStateProbDist(0);
			} else {
				$('#div-future-opts').addClass('hidden');
				$('#rng-time-probs').slider('disable');
				$('#rng-time-probs').slider('value', 0);
				if (viz.getMode() == 'probs')
					viz.resetMode();
			}
		});
		
		// buttons
		$('#btn-reset-sim').click(function () {
			$('#btn-reset-sim').addClass('hidden');
			$('#chk-sim-inputs').attr('checked', false);
			$('#chk-sim-inputs').change();
		});
		
		$('#btn-activate').click(function () {
			$.ajax('api/activateModelViz', {
				dataType: 'json',
				method: 'POST',
				data: { activate: !IS_MODEL_ACTIVE },
				success: function () {
					window.location.reload();
				},
				error: handleAjaxError()
			});
		});
		
		$('#btn-layout').click(function () {
			viz.autoLayout();
		})
		
		$('#btn-png').click(function () {
			var png = viz.getPNG();
			//console.log("PNG: " + png);
			window.open(png, '_newtab');
		});
		
		$('#btn-save').click(function () {
			var nodePositions = viz.getNodePositions();
			
			console.log(JSON.stringify(nodePositions));
			
			$.ajax('api/save', {
				dataType: 'json',
				data: { positions: JSON.stringify(nodePositions) },
				method: 'POST',
				success: function (data) {
					showAlert($('#alert-holder'), $('#alert-wrapper-viz-config'), 'alert-success', 'Saved!', null, true);
				},
				error: handleAjaxError($('#alert-wrapper-viz-config'))
			});
		});
		
		$('#chk-show-probs').change(function () {
			var checked = $(this).is(":checked");
			viz.setShowTransitionProbs(checked);
		});
		
		$('#chk-wheel-scroll').change(function () {
			var checked = $(this).is(":checked");
			viz.setWheelScroll(checked);
		});
	})();
	
	//=======================================================
	// VIZUALIZATION HANDLERS
	//=======================================================
	
	(function () {
		viz = zoomVis({
			visContainer: 'vis_container'
		});
		
		function visualizeDecisionTree(root) {
			$('#div-tree-wrapper').removeClass('hidden');
			
			var totalExamples = root.examples;
			
			var nodes = [];
			var edges = [];
			
			var minNodeSize = 100;
			var pieSize = minNodeSize*.8;
			var levelH = 250;
			var hPadding = 50;
					
			var maxNodeW = 1500;
			var minNodeW = 150;
			
			var nodeWRange = maxNodeW - minNodeW;
	
			function getNodeW(examples) {
				var w = nodeWRange*Math.log(1 + 999*examples / root.examples) / 6.907755278982137;
				var uiW = minNodeW + w;
				return uiW;
			}
			
			var currNodeId = 0;
			var maxDepth = Number.MAX_VALUE;
			
			(function construct(node, depth) {
				var children = node.children;
				
				node.id = currNodeId + '';
				currNodeId++;
				
				var data = {
					id: node.id,
					pie1: node.classes[0]*100,
					pie2: node.classes[1]*100
				}
				
				if (node.cut != null) {
					var cut = node.cut;
					
					var label = cut.name;
					
					var alternatives = cut.alternatives;
					if (alternatives.length > 0 &&
							alternatives[0].corr > .9 &&
							alternatives[0].p < .1) {
						label += '\n(' + alternatives[0].name + ')';
					}
					
					if (cut.value > 1000) {
						label += '\n\u2264 ' + node.cut.value.toFixed() + ' <';
					} else {
						label += '\n\u2264 ' + node.cut.value.toPrecision(3) + ' <';
					}
					
					data.label = label;
				}
				
				node.data = data;
				
				if (depth == maxDepth) {
					node.width = nodeW;
					node.children = [];
					return;
				}
				
				var totalW = 0;
				for (var i = 0; i < children.length; i++) {
					var child = children[i];
					
					construct(child, depth + 1);
					
					totalW += child.width;
					
					edges.push({
						data: {
							source: node.id,
							target: child.id,
						}
					});
				}
				
				if (children.length == 0) {
					node.width = getNodeW(node.examples) + hPadding;
				} else {
					node.width = totalW;
				}
			})(root, 0);
			
			(function position(node, pos) {
				var children = node.children;
				
				nodes.push({
					data: node.data,
					position: pos,
					css: {
						width: getNodeW(node.examples).toFixed()
					}
				});
				
				var startX = pos.x - node.width / 2;
				var widthSum = 0;
				for (var i = 0; i < children.length; i++) {
					var child = children[i];
					
					var childCenter = startX + widthSum + child.width/2;
					position(child, { x: childCenter, y: pos.y + levelH });
					
					widthSum += child.width;
				}
			})(root, { x: 0, y: 0 });
			
			var edgeColor = 'darkgray';
			
			var cy = cytoscape({
				container: document.getElementById('div-tree-container'),
				
				boxSelectionEnabled: false,
				autounselectify: true,
				fit: true,
				wheelSensitivity: 0.01,
				autoungrabify: true,
				
				layout: {
					name: 'preset'
				},
				
				style: [
					{
						selector: 'node',
						style: {
							'content': 'data(label)',
							'text-valign': 'bottom',
							'text-halign': 'center',
							'text-wrap': 'wrap',
							'background-color': 'rgb(124, 181, 236)',
							'border-width': 5,
							'font-size': 40,
							'height': minNodeSize,
							'shape': 'rectangle',
							'pie-size': pieSize + 'px',
							'pie-1-background-color': 'red',
							'pie-2-background-color': 'green',
							'pie-1-background-opacity': 100,
							'pie-2-background-opacity': 100,
							'pie-1-background-size': 'mapData(pie1, 0, 100, 0, 100)',
							'pie-2-background-size': 'mapData(pie2, 0, 100, 0, 100)'
						}
					},
	
					{
						selector: 'edge',
						style: {
							'content': 'data(label)',
							'width': 4,
							'font-size': 50,
							'target-arrow-shape': 'triangle',
							'line-color': edgeColor,
							'target-arrow-color': edgeColor,
							'width': 10
						}
					}
				],
				elements: {
					nodes: nodes,
					edges: edges
				},
				
				ready: function () {
	//				cy.fit(cy.nodes());
	//				cy.panningEnabled(false);
	//				cy.mapData('pie1', 0, 100, 0, 100)
				}
			});
		}
		
		(function () {
			var prevVal = 1;
			
			$("#threshold_slider").slider({
				value: prevVal,
				min: .5,
				max: 1,
				step: 0.01,
				animate:"slow",
				orientation: "hotizontal",
				change: function (event, ui) {
					var val = ui.value;
					if (val != prevVal) {
						prevVal = val;
						viz.setTransitionThreshold(val);
					}
				},
				slide: function (event, ui) {
					var val = ui.value;
					
					if (Math.abs(val - prevVal) > .15) {
						prevVal = val;
						viz.setTransitionThreshold(val);
					}
				},
			});
		})();
	
		$("#slider_item_div").slider({
			value: viz.getZoom(),
			min: viz.getMinZoom(),
			max: viz.getMaxZoom(),
			step: 0.01,
			animate:"slow",
			orientation: "vertical",
			slide: function (event, ui) {
				viz.setZoom(ui.value);
			}
		});
		
		$('#vis-toggler').click(function () {
			$('#content-options').slideToggle();
		});
		
		$('#btn-viz-back').click(function () {
			// fetch the whole model
			$.ajax('api/model', {
				dataType: 'json',
				method: 'GET',
				success: function (model) {
					viz.setSubModel(model);
					$('#btn-viz-back').addClass('hidden');
				},
				error: handleAjaxError()
			});
		});
		
		viz.onZoomChanged(function (zoom) {
			$("#slider_item_div").slider('value', zoom);
		});
		
		viz.onStateSelected(function (stateId, height) {
			$('#wrapper-transition-details').hide();
			$('#wrapper-state-details').hide();
			if ($('#chk-show-fut').is(':checked')) {
				$('#chk-show-fut').attr('checked', false);
				$('#chk-show-fut').change();
			}
			
			if (stateId == null) return;
			
			// fetch state details
			$.ajax('api/stateDetails', {
				dataType: 'json',
				data: { stateId: stateId, level: height },
				success: function (data) {
					$('#wrapper-state-details').show();
					$('#txt-name').off('keyup');
					
					var stateLabel = data.label;
					
					// clear the panel
					$('#txt-name').val(stateLabel);
					$('#chk-target').removeAttr('checked');
					$('#txt-event-id').val('');
					$('#div-button-save-state').addClass('hidden');
					$('#div-attrs').html('');
					$('#div-future').html('');
					$('#div-past').html('');
					$('#div-tree-container').html('');

					visualizeDecisionTree(data.classifyTree);
										
					// populate
					// basic info
					if (data.name != null) $('#txt-name').val(data.name);
					
					$('#chk-target').off('change');	// remove the previous handlers
					$('#chk-target').prop('checked', data.isTarget != null && data.isTarget);
					if (data.isTarget != null && data.isTarget) {
						$('#div-event-id').removeClass('hidden');
					} else {
						$('#div-event-id').addClass('hidden');
					}
					
					$('#txt-name').keyup(function () {
						$('#div-button-save-state').removeClass('hidden');
					});
					
					$('#chk-target').change(function (event) {
						$('#div-button-save-state').removeClass('hidden');
						
						var isUndesiredEvent = $('#chk-target').is(':checked');

						if (isUndesiredEvent) {
							$('#div-event-id').removeClass('hidden');
						} else {
							$('#div-event-id').addClass('hidden');
						}
					});
										
					// features
					// feature weights
					var ftrWgts = data.featureWeights;
					// find max and min weigts
					var maxWgt = Number.NEGATIVE_INFINITY;
					var minWgt = Number.POSITIVE_INFINITY;
					
					for (var i = 0; i < ftrWgts.length; i++) {
						if (ftrWgts[i] > maxWgt) maxWgt = ftrWgts[i];
						if (ftrWgts[i] < minWgt) minWgt = ftrWgts[i];
					}
					
					// fetch histograms
					$.each(data.features.observations, function (idx, val) {
						var histContainerId = 'container-hist-' + idx;
						var ftrId = idx;
						
						var color;
						if (ftrWgts[ftrId] > 0)
							color = 'rgb(' + Math.floor(255 - 255*ftrWgts[ftrId] / maxWgt) + ',255,' + Math.floor(255 - 255*ftrWgts[ftrId] / maxWgt) + ')';
						else
							color = 'rgb(255,' + Math.floor(255 - 255*ftrWgts[ftrId] / minWgt) + ',' + Math.floor(255 - 255*ftrWgts[ftrId] / minWgt) + ')';
												
						var thumbnail = ui.createThumbnail({
							name: val.name,
							value: val.value,
							valueColor: color,
							histogramContainer: histContainerId
						});
						$('#div-attrs').append(thumbnail);
						ui.fetchHistogram(stateId, idx, false, histContainerId, false);
					});
					
					var nObsFtrs = data.features.observations.length;
					
					$.each(data.features.controls, function (idx, val) {
						var ftrVal = val.value;
						var bounds = val.bounds;
						var ftrId = nObsFtrs + idx;
						var histContainerId = 'container-hist-' + (nObsFtrs + idx);
						
						var color;
						if (ftrWgts[ftrId] > 0)
							color = 'rgb(' + Math.floor(255 - 255*ftrWgts[ftrId] / maxWgt) + ',255,' + Math.floor(255 - 255*ftrWgts[ftrId] / maxWgt) + ')';
						else
							color = 'rgb(255,' + Math.floor(255 - 255*ftrWgts[ftrId] / minWgt) + ',' + Math.floor(255 - 255*ftrWgts[ftrId] / minWgt) + ')';
												
						var thumbnail = ui.createThumbnail({
							name: val.name,
							value: ftrVal,
							histogramContainer: histContainerId,
							valueColor: color,
							isLeaf: data.isLeaf,
							ftrId: ftrId,
							min: bounds.min,
							max: bounds.max,
							stateId: stateId
						});
						
						$('#div-attrs').append(thumbnail);
						
						ui.fetchHistogram(stateId, nObsFtrs + idx, false, 'container-hist-' + (nObsFtrs + idx), false);
					});
					
					var nContrFtrs = data.features.controls.length;
					
					$.each(data.features.ignored, function (idx, val) {
						var ftrId = nObsFtrs + nContrFtrs + idx;
						var ftrVal = val.value;
						var bounds = val.bounds;
						var ftrId = nObsFtrs + nContrFtrs + idx;
						var histContainerId = 'container-hist-' + ftrId;
						
						var color;
						if (ftrWgts[ftrId] > 0)
							color = 'rgb(' + Math.floor(255 - 255*ftrWgts[ftrId] / maxWgt) + ',255,' + Math.floor(255 - 255*ftrWgts[ftrId] / maxWgt) + ')';
						else
							color = 'rgb(255,' + Math.floor(255 - 255*ftrWgts[ftrId] / minWgt) + ',' + Math.floor(255 - 255*ftrWgts[ftrId] / minWgt) + ')';
												
						var thumbnail = ui.createThumbnail({
							name: val.name,
							value: ftrVal,
							histogramContainer: histContainerId,
							valueColor: color
						});
						
						$('#div-attrs').append(thumbnail);
						
						ui.fetchHistogram(stateId, ftrId, false, 'container-hist-' + ftrId, false);
					});
										
					// add handlers
					$('#txt-event-id').off('change');
					
					if (data.undesiredEventId != null) { $('#txt-event-id').val(data.undesiredEventId); }
					
					$('#txt-event-id').change(function () {
						$('#div-button-save-state').removeClass('hidden');
					});
					
					$('#btn-button-save-state').off('click');
					$('#btn-button-save-state').click(function () {
						var stateName = $('#txt-name').val();
						var isUndesired = $('#chk-target').is(':checked');
						var eventId = $('#txt-event-id').val();
						
						var data = {
							id: stateId,
							name: stateName,
							isUndesired: isUndesired
						};
						
						if (isUndesired && eventId != null && eventId != '') {
							data.eventId = eventId;
						}
						
						var shouldClear = stateName == '' || stateName == stateId;
						if (shouldClear) {	// clear the state name
							delete data.name;
						}
						
						$.ajax('api/stateProperties', {
							dataType: 'json',
						    type: 'POST',
						    data: data,
						    success: function () {
						    	viz.setStateName(stateId, shouldClear ? stateLabel : stateName);
						    	viz.setTargetState(stateId, isUndesired);
						    	
						    	if (shouldClear)
						    		$('#txt-name').val(stateLabel);
						    	
						    	$('#div-button-save-state').addClass('hidden');
						    	showAlert($('#alert-holder'), $('#alert-wrapper-save-state'), 'alert-success', 'Saved!', null, true);
						    },
						    error: handleAjaxError($('#alert-wrapper-save-state'))
						});
					});
				},
				error: handleAjaxError()
			});
		});
		
		viz.onEdgeSelected(function (sourceId, targetId) {
			//reset the values
			$('#div-trans-ftrs').html('');
			
			$('#span-trans-source').html(sourceId);
			$('#span-trans-target').html(targetId);
			
			for (var ftrId = 0; ftrId < featureInfo.length; ftrId++) {
				var ftr = featureInfo[ftrId];
				var containerId = 'container-transition-hist-' + ftrId;
				
				$('#div-trans-ftrs').append(ui.createThumbnail({
					name: ftr.name,
					value: null,
					valueColor: null,
					histogramContainer: containerId
				}));
				
				ui.fetchTransitionHistogram(sourceId, targetId, ftrId, containerId);
			}
			
			$('#wrapper-state-details').hide();
			$('#wrapper-transition-details').show();
		});
		
		viz.onHeightChanged(function (height) {
			$('#span-zoom-val').html((100*height).toFixed());
			if ($('#chk-show-fut').is(':checked')) {
				$('#chk-show-fut').attr('checked', false);
				$('#chk-show-fut').change();
			}
		});
		
		function onZoomIntoState(stateId) {
			// get the sub model
			$.ajax('api/subModel', {
				dataType: 'json',
				method: 'GET',
				data: { stateId: stateId },
				success: function (model) {
					viz.setSubModel(model);
					$('#btn-viz-back').removeClass('hidden');
				},
				error: handleAjaxError()
			});
		}
		
		function showPath(stateId, height) {
			// get the sub model
			$.ajax('api/path', {
				dataType: 'json',
				method: 'GET',
				data: { stateId: stateId, height: height, length: 4, probThreshold: .2 },
				success: function (model) {
					viz.setSubModel(model);
					$('#btn-viz-back').removeClass('hidden');
				},
				error: handleAjaxError()
			});
		}
		
		viz.onStateCtxMenu(function (id, label, level, height) {
			var result = [
			    {
					content: 'Show Path',
					select: function (node) {
						onShowPath(id, height);
					}
				}          
			];
			
			if (level > 1) {
				result.push({
					content: 'Zoom Into',
					select: function (node) {
						onZoomIntoState(id);
					}
				});
			}
			
			if (TAB_ID == 'a-activities') {
				result.push({
					content: 'Add to Step',
					select: function (node) {
						act.addActivityState(id, label);
					}
				});
			}
			
			return result;
		});
	})();
	
	//=======================================================
	// ACTIVITY RECOGNITION
	//=======================================================
	
	(function () {
		var currStep = {};
		var currStepN = 0;
		var currStepSize = 0;
		
		var alertField = $('#alert-wrapper-activity');
		
		$('#btn-activity-add-step').click(function () {
			var currThumb = $('#div-curr-activity-step');
			var newThumb = currThumb.clone(true);
			
			currThumb.removeAttr('id');
			newThumb.find('.thumbnail').html('');
			
			$('#div-activity-currconf').append(newThumb);
			
			currStep = {};
			currStepN++;
			currStepSize = 0;
		});
		
		$('#btn-activity-cancel').click(function () {
			var currThumb = $('#div-curr-activity-step').clone(true);
			
			$('#div-activity-currconf').html('');
			$('#div-activity-currconf').append(currThumb);
			
			currStep = {};
			currStepN = 0;
			currStepSize = 0;
		});
		
		$('#btn-activity-save').click(function () {
			// get the activity
			var name = $('#txt-activity-name').val();
			var sequence = [];
			
			if (name == null || name == '') {
				showAlert($('#alert-holder'), alertField, 'alert-warning', 'Missing activity name!', null, false);
				return;
			}
			
			$.each($('#div-activity-currconf .step-wrapper'), function (i, div) {
				var stateIds = [];
				
				var thumbnail = $(div).find('.thumbnail');
				$.each(thumbnail.find('span'), function (j, span) {
					var spanId = $(span).attr('id');
					var stateId = spanId.split('-')[2];
					stateIds.push(parseInt(stateId));
				});
				
				sequence.push(stateIds);
			});
			
			var data = {
				name: name,
				sequence: JSON.stringify(sequence)
			};
			
			$.ajax('api/activity', {
				dataType: 'json',
			    type: 'POST',
			    data: data,
			    success: function () {
			    	$('#btn-activity-cancel').click();
			    	showAlert($('#alert-holder'), alertField, 'alert-success', 'Saved!', null, true);
			    },
			    error: handleAjaxError(alertField)
			});
		});
		
		$('#table-activities').find('.btn-remove').click(function () {
			var tr = $(this).parent().parent().parent();
			var txt = tr.find('.td-name').html();
			var name = txt.replace(/\s\([0-9]*\)$/, '');
			
			promptConfirm('Remove Activity', 'Are you sure you wish remove activity ' + name + '?', function () {
				$.ajax('api/removeActivity', {
					dataType: 'json',
				    type: 'POST',
				    data: { name: name },
				    success: function () {
				    	tr.remove();
				    	showAlert($('#alert-holder'), alertField, 'alert-success', 'Removed!', null, true);
				    },
				    error: handleAjaxError(alertField)
				});
			});
		});
		
		act =  {
			addActivityState: function (stateId, label, name) {
				if (stateId in currStep) {
					showAlert($('#alert-holder'), alertField, 'alert-warning', 'State already in the current step!', null, true);
					return;
				}
				
				var stateStr = name != null ? name : label;
				
				$('#div-curr-activity-step').find('.thumbnail').append((currStepSize > 0 ? ', ' : '') + '<span id="step-' + currStepN + '-' + stateId + '">' + stateStr + '</span>');
				
				currStep[stateId] = true;
				currStepSize++;
			}
		}
	})();
	
	$(document).ready(function () {
		$('#div-msg-0, #div-msg-1').alert();
		
		$('.nav-pills a').click(function () {
			TAB_ID = $(this).attr('id');
			
			if (TAB_ID == 'a-default') {
				// TODO fetch the histograms
			}
		});
		$('.nav-pills a')[0].click()
	});
})()